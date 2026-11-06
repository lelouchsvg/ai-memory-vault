import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, toRecord, type DB } from './db';
import {
  STAGES,
  AGENTS,
  DEFAULT_POLICY,
  calculateArv,
  calculateRepairs,
  underwrite,
  scoreLead,
  estimateProbability,
  matchBuyer,
  calculatePnl,
  redTeam,
  validateTransition,
} from './domain';

export type Mode = 'DEMO' | 'LIVE';
export type Actor = { id: string; email: string; role: string };
type R = Record<string, any>;
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
const ENTITY_TABLES = [
  'properties',
  'sellers',
  'buyers',
  'comps',
  'repairs',
  'tasks',
  'approvals',
  'documents',
  'closings',
  'transactions',
  'notifications',
  'matches',
  'deadlines',
] as const;
type Entity = (typeof ENTITY_TABLES)[number];
const SAVE_ENTITIES: readonly string[] = [
  'properties',
  'sellers',
  'buyers',
  'comps',
  'repairs',
  'tasks',
  'documents',
  'closings',
  'transactions',
  'deadlines',
];
const MODES = ['DEMO', 'LIVE'];
const UUID = z.string().uuid();
const TASK_STATUSES = [
  'BACKLOG',
  'READY',
  'IN PROGRESS',
  'BLOCKED',
  'NEEDS APPROVAL',
  'DONE',
  'FAILED',
];
const number = (value: unknown, fallback = 0) =>
  value == null || value === '' ? fallback : Number(value);
const money = (value: unknown) => Math.round(number(value) * 100) / 100;
const stamp = () => new Date().toISOString();
const DAY = 86_400_000;
const dateValid = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
export const DEFAULT_SETTINGS: R = {
  companyName: 'Demo Acquisitions',
  primaryMarket: 'Atlantic County, NJ',
  targetCounties: ['Atlantic', 'Cape May'],
  propertyType: 'SINGLE FAMILY',
  minimumAssignmentFee: 15000,
  targetInvestorMargin: 20,
  repairContingency: 15,
  riskAllowance: 10000,
  holdingCosts: 12000,
  transactionCosts: 18000,
  ownerTimezone: 'America/New_York',
  onboardingComplete: false,
  followUpIntervals: { HOT: 1, WARM: 7, NURTURE: 30 },
  buyerWeights: {
    geography: 25,
    propertyType: 15,
    price: 20,
    rehab: 10,
    size: 10,
    funds: 10,
    reliability: 10,
  },
  leadWeights: { motivation: 25, engagement: 20, price: 20, ownership: 20, condition: 15 },
  notificationThresholds: [14, 7, 3, 1],
  automationEnabled: true,
  externalOutreachEnabled: false,
  jurisdictionRules: [],
  underwritingProfile: 'Conservative investor spread',
};

function requireOwner(actor: Actor) {
  if (actor.role !== 'OWNER') throw new ServiceError('Owner permission required', 403);
}
function validMode(mode: unknown): Mode {
  if (!MODES.includes(String(mode))) throw new ServiceError('mode must be DEMO or LIVE');
  return mode as Mode;
}
function validId(id: unknown): string {
  const result = UUID.safeParse(id);
  if (!result.success) throw new ServiceError('Valid record ID required');
  return result.data;
}
function clean(data: R): R {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([k, v]) =>
        ![
          'id',
          'mode',
          'dealId',
          'createdAt',
          'updatedAt',
          '__proto__',
          'prototype',
          'constructor',
        ].includes(k) && v !== undefined,
    ),
  );
}
async function rows(db: DB, entity: Entity, mode: Mode): Promise<R[]> {
  return (
    await db.query(`SELECT * FROM ${entity} WHERE mode=$1 ORDER BY created_at DESC,id`, [mode])
  ).rows.map(toRecord);
}
async function one(db: DB, entity: Entity, id: unknown, mode: Mode, lock = false): Promise<R> {
  const result = await db.query(
    `SELECT * FROM ${entity} WHERE id=$1 AND mode=$2${lock ? ' FOR UPDATE' : ''}`,
    [validId(id), mode],
  );
  if (!result.rowCount) throw new ServiceError(`${entity} record not found in ${mode} mode`, 404);
  return toRecord(result.rows[0]);
}
async function getSettings(db: DB, mode: Mode): Promise<R> {
  const result = await db.query('SELECT data FROM settings WHERE mode=$1', [mode]);
  return { ...DEFAULT_SETTINGS, ...result.rows[0]?.data };
}
async function audit(
  db: DB,
  actor: Actor,
  mode: Mode,
  action: string,
  entity: string,
  entityId: string | null,
  oldValue: unknown,
  newValue: unknown,
  reason = '',
  propertyId: string | null = null,
  source = 'APPLICATION',
) {
  await db.query(
    'INSERT INTO audit_log(mode,actor,actor_type,action,entity,entity_id,property_id,old_value,new_value,reason,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [
      mode,
      actor.email || actor.id,
      actor.id.startsWith('agent:') ? 'AGENT' : 'USER',
      action,
      entity,
      entityId,
      propertyId,
      JSON.stringify(oldValue),
      JSON.stringify(newValue),
      reason,
      source,
    ],
  );
}
async function insert(db: DB, entity: Entity, mode: Mode, data: R): Promise<R> {
  const id = String(data.id ?? randomUUID());
  const fields = ['id', 'mode', 'data'];
  const values: unknown[] = [id, mode, JSON.stringify(clean(data))];
  if (entity === 'properties') {
    const seq = await db.query("SELECT nextval('deal_number_seq') AS n");
    fields.push('deal_id', 'seller_id');
    values.push(
      `${String(data.state ?? 'NJ').toUpperCase()}-${String(data.county ?? 'GEN')
        .slice(0, 3)
        .toUpperCase()}-${String(seq.rows[0].n).padStart(6, '0')}`,
      data.sellerId ?? null,
    );
  } else if (!['sellers', 'buyers'].includes(entity)) {
    fields.push('property_id');
    values.push(data.propertyId ?? null);
    if (['tasks', 'approvals', 'transactions', 'notifications'].includes(entity)) {
      fields.push('seller_id', 'buyer_id');
      values.push(data.sellerId ?? null, data.buyerId ?? null);
    }
    if (entity === 'matches') {
      fields.push('buyer_id');
      values.push(data.buyerId);
    }
  }
  const result = await db.query(
    `INSERT INTO ${entity}(${fields.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    values,
  );
  return toRecord(result.rows[0]);
}
async function update(db: DB, entity: Entity, old: R, patch: R): Promise<R> {
  const next = { ...old, ...patch };
  if (entity === 'properties') {
    next.probability = estimateProbability(next);
    next.weightedPipeline = ['CLOSED', 'DEAD', 'LOST'].includes(next.stage)
      ? 0
      : money((number(next.projectedAssignmentFee) * number(next.probability)) / 100);
  }
  const values: unknown[] = [JSON.stringify(clean(next)), old.id, old.mode];
  let extra = '';
  if (entity === 'properties' && 'sellerId' in patch) {
    values.push(patch.sellerId ?? null);
    extra = ',seller_id=$4';
  }
  const result = await db.query(
    `UPDATE ${entity} SET data=$1,updated_at=now()${extra} WHERE id=$2 AND mode=$3 RETURNING *`,
    values,
  );
  return toRecord(result.rows[0]);
}
async function enqueue(
  db: DB,
  mode: Mode,
  kind: string,
  propertyId: string | null,
  key: string,
  payload: R = {},
) {
  await db.query(
    'INSERT INTO jobs(mode,kind,property_id,idempotency_key,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mode,idempotency_key) DO NOTHING',
    [mode, kind, propertyId, key, JSON.stringify(payload)],
  );
}
async function createTask(db: DB, mode: Mode, record: R) {
  if (record.dedupeKey) {
    const existing = await db.query("SELECT * FROM tasks WHERE mode=$1 AND data->>'dedupeKey'=$2", [
      mode,
      record.dedupeKey,
    ]);
    if (existing.rowCount) return toRecord(existing.rows[0]);
  }
  return insert(db, 'tasks', mode, {
    status: 'READY',
    priority: 'MEDIUM',
    department: 'OPS',
    assignedAgent: 'OPS',
    ...record,
  });
}
async function notify(db: DB, mode: Mode, record: R) {
  if (record.dedupeKey) {
    const existing = await db.query(
      "SELECT id FROM notifications WHERE mode=$1 AND data->>'dedupeKey'=$2",
      [mode, record.dedupeKey],
    );
    if (existing.rowCount) return;
  }
  await insert(db, 'notifications', mode, { read: false, severity: 'INFO', ...record });
}
function requiredText(data: R, field: string) {
  if (typeof data[field] !== 'string' || !data[field].trim())
    throw new ServiceError(`${field} is required`);
  if (data[field].length > 2000) throw new ServiceError(`${field} is too long`);
}
function validateNumbers(record: R, fields: string[]) {
  for (const field of fields)
    if (
      record[field] !== undefined &&
      (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0)
    )
      throw new ServiceError(`${field} must be a nonnegative number`);
}
async function validateRefs(db: DB, record: R, mode: Mode) {
  for (const [key, entity] of [
    ['propertyId', 'properties'],
    ['sellerId', 'sellers'],
    ['buyerId', 'buyers'],
  ] as const)
    if (record[key]) await one(db, entity, record[key], mode);
}
function normalized(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
async function duplicateContact(
  db: DB,
  entity: 'buyers' | 'sellers',
  mode: Mode,
  data: R,
  id?: string,
) {
  const entries = await rows(db, entity, mode);
  const found = entries.find(
    (r) =>
      r.id !== id &&
      ((data.email && normalized(r.email) === normalized(data.email)) ||
        (data.phone &&
          String(r.phone).replace(/\D/g, '') === String(data.phone).replace(/\D/g, ''))),
  );
  if (found)
    throw new ServiceError(
      `Duplicate ${entity === 'buyers' ? 'buyer' : 'seller'} contact exists`,
      409,
      { id: found.id },
    );
}
function propertyDefaults(record: R): R {
  return {
    stage: 'NEW LEAD',
    propertyType: 'SINGLE FAMILY',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1200,
    leadSource: 'Manual',
    source: 'Manual entry',
    leadScore: 0,
    probability: 0,
    riskGrade: 'YELLOW',
    titleStatus: 'NOT STARTED',
    ownershipVerified: false,
    ownershipConfidence: 0,
    nextAction: 'Verify ownership and collect comparable sales',
    ...record,
  };
}
async function saveRecord(
  db: DB,
  actor: Actor,
  mode: Mode,
  entityRaw: unknown,
  raw: unknown,
): Promise<R> {
  if (!SAVE_ENTITIES.includes(String(entityRaw))) throw new ServiceError('Entity is not editable');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ServiceError('record must be an object');
  const entity = entityRaw as Entity;
  let record = { ...(raw as R) };
  for (const key of ['propertyId', 'sellerId', 'buyerId', 'dependencyId'])
    if (record[key] === '') record[key] = null;
  const old = record.id ? await one(db, entity, record.id, mode, true) : null;
  if (['transactions', 'documents', 'closings'].includes(entity)) requireOwner(actor);
  if (old) record = { ...old, ...record };
  await validateRefs(db, record, mode);
  if (entity === 'properties') {
    for (const field of ['address', 'city', 'state', 'zip']) requiredText(record, field);
    if (!/^[A-Za-z]{2}$/.test(record.state)) throw new ServiceError('state must have two letters');
    if (!/^\d{5}(?:-\d{4})?$/.test(record.zip))
      throw new ServiceError('zip must be a valid US ZIP');
    const computed = [
      'arvLow',
      'arvBase',
      'arvHigh',
      'arvConfidence',
      'repairLow',
      'repairExpected',
      'repairHigh',
      'mao',
      'investorMax',
      'recommendedOffer',
      'projectedAssignmentFee',
      'actualAssignmentFee',
      'probability',
      'weightedPipeline',
      'riskGrade',
      'riskReasons',
      'underwriting',
      'offerApproved',
      'selectedBuyerId',
      'closedAt',
      'contractPrice',
      'executionDate',
      'contractApproved',
      'contractApprovedBy',
      'approvedOfferId',
      'signedDocumentStatus',
      'signedDocumentId',
      'signedDocument',
      'buyerId',
      'titleStatus',
      'fundingStatus',
      'offerDeliveryStatus',
      'underwrittenAt',
      'underwritingRevision',
      'postmortem',
      'actualOffer',
      'closedAt',
      'closingApproved',
      'maoOverride',
      'ownerVerified',
      'ownershipStatus',
      'selectedBuyerId',
    ];
    for (const field of computed)
      if (
        field in (raw as R) &&
        (!old || JSON.stringify((raw as R)[field]) !== JSON.stringify(old[field]))
      )
        throw new ServiceError(`${field} is calculated or controlled by its workflow`);
    if (record.stage && record.stage !== (old?.stage ?? 'NEW LEAD'))
      throw new ServiceError('Use the transition workflow to change stage');
    if (record.ownershipVerified !== undefined && typeof record.ownershipVerified !== 'boolean')
      throw new ServiceError('ownershipVerified must be a boolean');
    if (record.ownershipVerified) {
      requireOwner(actor);
      for (const field of ['ownershipSource', 'ownershipRetrievedAt']) requiredText(record, field);
      if (!dateValid(record.ownershipRetrievedAt) || number(record.ownershipConfidence) < 70)
        throw new ServiceError(
          'Ownership verification needs a source, retrieval date and confidence of at least 70',
        );
    }
    if ('targetAssignmentPrice' in (raw as R)) requireOwner(actor);
    validateNumbers(record, [
      'bedrooms',
      'bathrooms',
      'sqft',
      'lotSize',
      'yearBuilt',
      'askingPrice',
      'sellerAskingPrice',
      'targetAssignmentPrice',
    ]);
    const leadSettings = await getSettings(db, mode);
    record = propertyDefaults({ ...record, state: record.state.toUpperCase() });
    record.leadScore = scoreLead(record, leadSettings.leadWeights);
    record.probability = estimateProbability(record);
    if (
      old &&
      [
        'sqft',
        'bedrooms',
        'bathrooms',
        'propertyType',
        'askingPrice',
        'sellerAskingPrice',
        'targetAssignmentPrice',
        'ownershipVerified',
        'ownershipConfidence',
      ].some((k) => k in (raw as R) && JSON.stringify(record[k]) !== JSON.stringify(old[k]))
    ) {
      record.underwrittenAt = null;
      record.underwritingRevision = null;
      record.offerApproved = false;
      record.underwritingStale = true;
    }
  } else if (entity === 'sellers' || entity === 'buyers') {
    requiredText(record, 'name');
    if (record.email && !z.string().email().safeParse(record.email).success)
      throw new ServiceError('Valid email required');
    if (record.phone && !/^\+?[\d\s()\-.]{7,25}$/.test(record.phone))
      throw new ServiceError('Valid phone number required');
    await duplicateContact(db, entity, mode, record, old?.id);
    if (entity === 'sellers') {
      record = { status: 'NEW', doNotContact: false, consent: false, ...record };
      if (typeof record.doNotContact !== 'boolean' || typeof record.consent !== 'boolean')
        throw new ServiceError('Consent and do-not-contact must be boolean');
      if (
        ![
          'NEW',
          'UNCONTACTED',
          'ATTEMPTED',
          'CONNECTED',
          'QUALIFIED',
          'HOT',
          'WARM',
          'NURTURE',
          'NEGOTIATING',
          'AGREEMENT',
          'CLOSED',
          'DO NOT CONTACT',
          'DEAD',
        ].includes(record.status)
      )
        throw new ServiceError('Invalid seller status');
      if (old?.doNotContact && !record.doNotContact) {
        requireOwner(actor);
        if (!record.consentSource || !dateValid(record.consentRecordedAt))
          throw new ServiceError(
            'New opt-in evidence and consentRecordedAt required to remove do-not-contact',
          );
      }
    } else {
      record = {
        tier: 'NEW',
        buyerType: 'FLIPPER',
        counties: [],
        propertyTypes: ['SINGLE FAMILY'],
        minPrice: 0,
        maxPrice: 500000,
        maxRehab: 100000,
        reliabilityScore: 50,
        proofOfFundsStatus: 'UNVERIFIED',
        ...record,
      };
      validateNumbers(record, [
        'minPrice',
        'maxPrice',
        'maxRehab',
        'minBedrooms',
        'minSqft',
        'reliabilityScore',
      ]);
      if (number(record.minPrice) > number(record.maxPrice))
        throw new ServiceError('Buyer minimum exceeds maximum price');
      if (number(record.reliabilityScore) > 100)
        throw new ServiceError('Reliability cannot exceed 100');
    }
  } else if (entity === 'comps') {
    for (const field of ['propertyId', 'address', 'source', 'saleDate'])
      requiredText(record, field);
    if (!positive(record.salePrice) || !positive(record.sqft) || !dateValid(record.saleDate))
      throw new ServiceError('Comp sale price, square footage and sale date required');
    if (Date.parse(record.saleDate) > Date.now())
      throw new ServiceError('Comp sale date cannot be in the future');
    record = {
      distance: 0,
      excluded: false,
      retrievedAt: stamp(),
      ...record,
      pricePerSqft: money(number(record.salePrice) / number(record.sqft)),
    };
  } else if (entity === 'repairs') {
    requiredText(record, 'propertyId');
    requiredText(record, 'category');
    record = { low: 0, expected: 0, high: 0, ...record };
    validateNumbers(record, ['low', 'expected', 'high']);
    if (
      number(record.low) > number(record.expected) ||
      number(record.expected) > number(record.high)
    )
      throw new ServiceError('Repair low ≤ expected ≤ high is required');
  } else if (entity === 'tasks') {
    requiredText(record, 'title');
    record = { status: 'READY', priority: 'MEDIUM', department: 'OPS', ...record };
    if (!TASK_STATUSES.includes(record.status)) throw new ServiceError('Invalid task status');
    if (record.dueDate && !dateValid(record.dueDate))
      throw new ServiceError('Valid task due date required');
    if (record.dependencyId) {
      const dependency = await one(db, 'tasks', record.dependencyId, mode);
      if (dependency.id === record.id) throw new ServiceError('Task cannot depend on itself');
      if (record.status === 'DONE' && dependency.status !== 'DONE')
        throw new ServiceError('Task dependency is incomplete');
    }
  } else if (entity === 'documents') {
    requiredText(record, 'propertyId');
    requiredText(record, 'name');
    requiredText(record, 'type');
    record = {
      version: 1,
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      source: 'Owner supplied',
      ...record,
    };
    if (record.content && Buffer.byteLength(String(record.content)) > 500000)
      throw new ServiceError('Document exceeds 500KB text limit');
    if (record.url && !/^https:\/\//.test(record.url))
      throw new ServiceError('Document URL must use HTTPS');
    if (record.status === 'SIGNED' && !record.signedAt) record.signedAt = stamp();
    if (record.status === 'SIGNED' && !record.source)
      throw new ServiceError('Signed document needs evidence source');
    if (/<script|javascript:|data:text\/html/i.test(String(record.content ?? '')))
      throw new ServiceError('Active document content is not permitted');
    record.uploadedBy = actor.email;
  } else if (entity === 'closings') {
    requiredText(record, 'propertyId');
    record = { titleStatus: 'NOT STARTED', fundingStatus: 'PENDING', ...record };
    if (
      ![
        'NOT STARTED',
        'TITLE OPEN',
        'REVIEW',
        'ISSUE',
        'CLEAR',
        'SCHEDULED',
        'FUNDED',
        'CLOSED',
      ].includes(record.titleStatus)
    )
      throw new ServiceError('Invalid title status');
    if (record.titleStatus === 'CLOSED')
      throw new ServiceError('Use closing reconciliation to record a close');
  } else if (entity === 'deadlines') {
    requiredText(record, 'propertyId');
    requiredText(record, 'type');
    if (!dateValid(record.dueDate)) throw new ServiceError('Valid deadline date required');
  } else if (entity === 'transactions') {
    requiredText(record, 'category');
    if (
      !['EXPENSE', 'REVENUE'].includes(record.type) ||
      !positive(record.amount) ||
      !dateValid(record.date)
    )
      throw new ServiceError('Positive amount, date and EXPENSE or REVENUE type required');
    record = {
      ...record,
      amount: money(record.amount),
      reference: record.reference ?? `manual:${randomUUID()}`,
    };
    if (old)
      throw new ServiceError('Ledger entries are immutable; add a documented correction entry');
  }
  const saved = old
    ? await update(db, entity, old, record)
    : await insert(db, entity, mode, record);
  await audit(
    db,
    actor,
    mode,
    old ? 'UPDATE' : 'CREATE',
    entity,
    saved.id,
    old,
    saved,
    record.reason ?? '',
    saved.propertyId ?? (entity === 'properties' ? saved.id : null),
  );
  if (entity === 'properties') {
    if (!old) await enqueue(db, mode, 'SCOUT', saved.id, `new:${saved.id}`);
    if (saved.ownershipVerified && !old?.ownershipVerified)
      await enqueue(db, mode, 'COMPS', saved.id, `ownership:${saved.id}:${saved.updatedAt}`);
  }
  if (entity === 'comps' || entity === 'repairs') {
    const affected = await one(db, 'properties', saved.propertyId, mode, true);
    await update(db, 'properties', affected, {
      underwrittenAt: null,
      underwritingRevision: null,
      offerApproved: false,
      underwritingStale: true,
    });
    await enqueue(
      db,
      mode,
      'NUMBERS',
      saved.propertyId,
      `underwrite:${saved.id}:${saved.updatedAt}`,
    );
  }
  if (entity === 'sellers' && (saved.doNotContact || saved.status === 'DO NOT CONTACT')) {
    await db.query(
      'UPDATE tasks SET data=data||\'{"status":"BLOCKED","blockReason":"Do not contact"}\'::jsonb,updated_at=now() WHERE mode=$1 AND seller_id=$2 AND data->>\'status\' NOT IN (\'DONE\',\'FAILED\')',
      [mode, saved.id],
    );
  }
  if (entity === 'closings') {
    const property = await one(db, 'properties', saved.propertyId, mode, true);
    await update(db, 'properties', property, {
      titleStatus: saved.titleStatus,
      closingDate: saved.closingDate ?? property.closingDate,
    });
  }
  return saved;
}

function policy(settings: R): R {
  return {
    ...DEFAULT_POLICY,
    ...settings,
    assignmentFee: number(settings.minimumAssignmentFee, 15000),
    desiredAssignmentFee: number(settings.minimumAssignmentFee, 15000),
    investorProfitPercent: number(settings.targetInvestorMargin, 20),
    contingencyPercent: number(settings.repairContingency, 15),
  };
}
async function underwriting(db: DB, actor: Actor, mode: Mode, propertyId: unknown): Promise<R> {
  const property = await one(db, 'properties', propertyId, mode, true);
  const settings = await getSettings(db, mode);
  const compRows = (await rows(db, 'comps', mode)).filter((c) => c.propertyId === property.id);
  const repairRows = (await rows(db, 'repairs', mode)).filter((r) => r.propertyId === property.id);
  if (!compRows.length) throw new ServiceError('At least one sourced comparable sale is required');
  if (!repairRows.length) throw new ServiceError('At least one repair assumption is required');
  const arv = calculateArv(property, compRows);
  const repairs = calculateRepairs(repairRows, number(settings.repairContingency, 15));
  if (!number(arv.arvBase)) throw new ServiceError('No eligible comparable sales for ARV');
  const base = { ...property, ...arv, ...repairs };
  const economics = underwrite(base, policy(settings));
  const risk = redTeam({ ...base, ...economics }, compRows);
  const probability = estimateProbability({ ...base, ...economics, riskGrade: risk.grade });
  const saved = await update(db, 'properties', property, {
    ...arv,
    ...repairs,
    ...economics,
    underwriting: { ...economics, calculatedAt: stamp() },
    riskGrade: risk.grade,
    riskReasons: risk.reasons,
    riskMitigations: risk.mitigations,
    probability,
    weightedPipeline: money((economics.projectedAssignmentFee * probability) / 100),
    leadScore: scoreLead({ ...base, ...economics }, settings.leadWeights),
    underwrittenAt: stamp(),
    underwritingRevision: randomUUID(),
    underwritingStale: false,
    offerApproved: false,
    nextAction:
      risk.grade === 'RED' ? 'Resolve Red Team blockers' : 'Prepare an offer for owner review',
    nextActionDue: new Date(Date.now() + DAY).toISOString(),
  });
  await audit(
    db,
    actor,
    mode,
    'UNDERWRITING_CALCULATED',
    'properties',
    property.id,
    property,
    saved,
    'Deterministic sourced comps, repair assumptions and owner policy',
    property.id,
  );
  if (risk.grade === 'RED')
    await createTask(db, mode, {
      propertyId: property.id,
      title: 'Resolve Red Team blockers',
      description: risk.reasons.join('; '),
      priority: 'HIGH',
      department: 'NUMBERS',
      assignedAgent: 'RED TEAM',
      dedupeKey: `redteam:${property.id}:${property.updatedAt}`,
    });
  return saved;
}
async function matching(db: DB, actor: Actor, mode: Mode, propertyId: unknown): Promise<R[]> {
  const property = await one(db, 'properties', propertyId, mode, true);
  const buyers = await rows(db, 'buyers', mode);
  const settings = await getSettings(db, mode);
  const result: R[] = [];
  for (const buyer of buyers) {
    const match = matchBuyer(property, buyer, settings.buyerWeights);
    if (!match.eligible) continue;
    const existing = await db.query('SELECT * FROM matches WHERE property_id=$1 AND buyer_id=$2', [
      property.id,
      buyer.id,
    ]);
    const data = {
      propertyId: property.id,
      buyerId: buyer.id,
      buyerName: buyer.name,
      score: match.score,
      reasons: match.reasons,
      status: 'SUGGESTED',
      matchedAt: stamp(),
    };
    result.push(
      existing.rowCount
        ? await update(db, 'matches', toRecord(existing.rows[0]), data)
        : await insert(db, 'matches', mode, data),
    );
  }
  await audit(
    db,
    actor,
    mode,
    'BUYERS_MATCHED',
    'properties',
    property.id,
    null,
    { count: result.length },
    'Deterministic preference and reliability matching',
    property.id,
  );
  return result.sort((a, b) => b.score - a.score);
}
function complianceBlockers(settings: R, property: R): string[] {
  const rules = Array.isArray(settings.jurisdictionRules) ? settings.jurisdictionRules : [];
  const rule = rules.find((r: R) => r.state === property.state && r.active);
  if (!rule) return ['LEGAL REVIEW REQUIRED: no reviewed jurisdiction policy'];
  const errors: string[] = [];
  if (
    !rule.reviewedAt ||
    !dateValid(rule.reviewedAt) ||
    Date.now() - Date.parse(rule.reviewedAt) > 365 * DAY
  )
    errors.push('LEGAL REVIEW REQUIRED: jurisdiction review missing or stale');
  if (!rule.disclosuresConfirmed) errors.push('Required disclosures have not been confirmed');
  if (!rule.assignmentAllowed) errors.push('Assignment restrictions need legal review');
  if (!rule.attorneyApprovedTemplateId) errors.push('Attorney-approved template is required');
  return errors;
}
async function requestOffer(db: DB, actor: Actor, mode: Mode, input: R) {
  const property = await one(db, 'properties', input.propertyId, mode, true);
  if (!property.underwrittenAt)
    throw new ServiceError('Underwriting must run before an offer is prepared');
  if (property.riskGrade === 'RED')
    throw new ServiceError('Red Team blockers must be resolved before an offer');
  if (!property.ownershipVerified)
    throw new ServiceError('Verified ownership is required before an offer');
  const amount = money(input.amount ?? property.recommendedOffer);
  if (!positive(amount)) throw new ServiceError('Positive offer amount required');
  if (amount > number(property.mao) && (!input.overrideReason || actor.role !== 'OWNER'))
    throw new ServiceError('Offer exceeds MAO; explicit owner overrideReason is required');
  if (property.sellerId) {
    const seller = await one(db, 'sellers', property.sellerId, mode);
    if (seller.doNotContact || seller.status === 'DO NOT CONTACT')
      throw new ServiceError('Seller opted out; outreach is blocked');
  }
  const existing = await db.query(
    "SELECT * FROM approvals WHERE mode=$1 AND property_id=$2 AND data->>'action'='SEND SELLER OFFER' AND data->>'status'='PENDING'",
    [mode, property.id],
  );
  if (existing.rowCount) throw new ServiceError('An offer approval is already pending', 409);
  const approval = await insert(db, 'approvals', mode, {
    propertyId: property.id,
    sellerId: property.sellerId,
    action: 'SEND SELLER OFFER',
    status: 'PENDING',
    amount,
    reason: input.reason ?? 'Offer prepared from deterministic underwriting',
    financialImpact: amount,
    risk: property.riskGrade,
    recommendedAction: 'Review economics and seller permissions',
    supportingData: {
      mao: property.mao,
      arvBase: property.arvBase,
      repairExpected: property.repairExpected,
      source: property.source,
    },
    payload: {
      amount,
      overrideReason: input.overrideReason ?? null,
      underwritingRevision: property.underwritingRevision,
    },
    requestedBy: actor.email,
    requestedAt: stamp(),
  });
  await update(db, 'properties', property, {
    stage: 'OFFER READY FOR APPROVAL',
    actualOffer: amount,
    offerApproved: false,
  });
  await audit(
    db,
    actor,
    mode,
    'OFFER_REQUESTED',
    'approvals',
    approval.id,
    null,
    approval,
    input.reason ?? '',
    property.id,
  );
  return approval;
}
async function decideApproval(db: DB, actor: Actor, mode: Mode, input: R) {
  requireOwner(actor);
  const approval = await one(db, 'approvals', input.id, mode, true);
  if (approval.status !== 'PENDING')
    throw new ServiceError('Approval has already been decided', 409);
  if (!['APPROVED', 'REJECTED'].includes(input.decision))
    throw new ServiceError('APPROVED or REJECTED decision required');
  const patch: R = {
    status: input.decision,
    decidedBy: actor.email,
    decidedAt: stamp(),
    decisionReason: input.reason ?? '',
  };
  const property = approval.propertyId
    ? await one(db, 'properties', approval.propertyId, mode, true)
    : null;
  if (input.decision === 'APPROVED' && approval.action === 'SEND SELLER OFFER' && property) {
    if (
      !property.underwrittenAt ||
      !property.underwritingRevision ||
      property.underwritingRevision !== approval.payload?.underwritingRevision
    )
      throw new ServiceError(
        'Underwriting changed after offer preparation; reject and prepare a fresh offer',
      );
    const amount = money(input.payload?.amount ?? input.amount ?? approval.amount);
    if (!positive(amount)) throw new ServiceError('Positive approved offer required');
    if (amount > number(property.mao) && !input.overrideReason && !approval.payload?.overrideReason)
      throw new ServiceError('Owner must document an overrideReason above MAO');
    if (property.riskGrade === 'RED')
      throw new ServiceError('Red Team blockers must be resolved before approval');
    if (property.sellerId) {
      const seller = await one(db, 'sellers', property.sellerId, mode);
      if (seller.doNotContact || seller.status === 'DO NOT CONTACT')
        throw new ServiceError('Seller opted out; approval is blocked');
    }
    patch.amount = amount;
    patch.payload = {
      ...approval.payload,
      ...input.payload,
      amount,
      overrideReason: input.overrideReason ?? approval.payload?.overrideReason,
    };
    patch.executionStatus = mode === 'DEMO' ? 'DEMO SIMULATED' : 'NOT CONFIGURED';
    await update(db, 'properties', property, {
      offerApproved: true,
      approvedOfferId: approval.id,
      actualOffer: amount,
      stage: mode === 'DEMO' ? 'OFFER SENT' : 'OFFER READY FOR APPROVAL',
      offerDeliveryStatus: patch.executionStatus,
      nextAction:
        mode === 'DEMO'
          ? 'Record seller response (demo simulation)'
          : 'Configure delivery and clear legal review before sending',
    });
    if (mode === 'LIVE') {
      const settings = await getSettings(db, mode);
      patch.blockers = [
        ...complianceBlockers(settings, property),
        'Email/SMS provider NOT CONFIGURED',
      ];
      await createTask(db, mode, {
        propertyId: property.id,
        title: 'Approved offer not delivered — integration/legal review required',
        status: 'BLOCKED',
        priority: 'HIGH',
        description: patch.blockers.join('; '),
        dedupeKey: `offer-delivery:${approval.id}`,
      });
    }
  } else if (input.decision === 'REJECTED' && property && approval.action === 'SEND SELLER OFFER')
    await update(db, 'properties', property, {
      stage: 'OFFER PREPARATION',
      offerApproved: false,
      nextAction: 'Revise offer based on owner feedback',
    });
  if (input.decision === 'APPROVED' && approval.action === 'PROPOSED POLICY CHANGE') {
    const proposedSettings = input.payload?.settings ?? approval.payload?.settings;
    if (
      !proposedSettings ||
      typeof proposedSettings !== 'object' ||
      Array.isArray(proposedSettings)
    )
      throw new ServiceError('Proposed settings object required');
    await updateSettings(db, actor, mode, {
      settings: proposedSettings,
      ownerApproved: true,
      reason: input.reason ?? 'Owner approved policy change',
    });
    patch.payload = { ...approval.payload, settings: proposedSettings };
  }
  const saved = await update(db, 'approvals', approval, patch);
  await audit(
    db,
    actor,
    mode,
    input.decision,
    'approvals',
    approval.id,
    approval,
    saved,
    input.reason ?? '',
    property?.id ?? null,
  );
  return saved;
}

async function transition(db: DB, actor: Actor, mode: Mode, input: R) {
  const property = await one(db, 'properties', input.propertyId, mode, true);
  const to = String(input.stage);
  if (!(STAGES as readonly string[]).includes(to)) throw new ServiceError('Unknown pipeline stage');
  if (['CLOSED', 'DEAD', 'LOST'].includes(property.stage) && to !== property.stage)
    throw new ServiceError(
      'Terminal deal cannot advance; create a new lead or document a separate correction',
    );
  if (to === 'CLOSED') throw new ServiceError('Use closing reconciliation to close a deal');
  const ownerStages = [
    'UNDER CONTRACT',
    'TITLE OPEN',
    'DISPOSITIONS',
    'BUYER COMMITTED',
    'ASSIGNMENT PREPARATION',
    'CLOSING',
  ];
  if (ownerStages.includes(to)) requireOwner(actor);
  const deadlineRows = (await rows(db, 'deadlines', mode)).filter(
    (d) => d.propertyId === property.id,
  );
  const context: R = { ...input, deadlines: deadlineRows };
  const patch: R = { stage: to, stageChangedAt: stamp() };
  if (to === 'UNDER CONTRACT') {
    if (!property.offerApproved)
      throw new ServiceError('An owner-approved offer is required before recording a contract');
    if (
      !positive(input.contractPrice) ||
      !dateValid(input.executionDate) ||
      !dateValid(input.closingDate)
    )
      throw new ServiceError('Contract price, execution date and closing date are required');
    if (input.contractPrice > number(property.mao) && !input.overrideReason)
      throw new ServiceError('Contract exceeds MAO: owner overrideReason required');
    if (!input.ownerApproved)
      throw new ServiceError('Owner must attest that the contract was approved');
    const signed = await one(db, 'documents', input.signedDocumentId, mode);
    if (signed.propertyId !== property.id || signed.status !== 'SIGNED')
      throw new ServiceError('A signed document for this property is required');
    if (Date.parse(input.closingDate) <= Date.parse(input.executionDate))
      throw new ServiceError('Closing date must be after execution date');
    patch.contractPrice = money(input.contractPrice);
    patch.executionDate = input.executionDate;
    patch.closingDate = input.closingDate;
    patch.signedDocumentId = signed.id;
    patch.signedDocumentStatus = 'SIGNED';
    patch.contractApproved = true;
    patch.contractApprovedBy = actor.email;
    context.signedDocumentStatus = 'SIGNED';
    context.contractApproved = true;
    if (!deadlineRows.length) context.deadlines = [{ type: 'CLOSING', dueDate: input.closingDate }];
  } else if (to === 'OFFER SENT' && mode === 'LIVE')
    throw new ServiceError(
      'Delivery provider NOT CONFIGURED; cannot record a fabricated sent offer',
    );
  if (
    [
      'TITLE OPEN',
      'DISPOSITIONS',
      'BUYER MATCHING',
      'BUYER COMMITTED',
      'ASSIGNMENT PREPARATION',
      'CLOSING',
    ].includes(to) &&
    !property.contractApproved
  )
    throw new ServiceError(
      'An approved signed contract is required before dispositions or closing',
    );
  if (
    ['BUYER COMMITTED', 'ASSIGNMENT PREPARATION', 'CLOSING'].includes(to) &&
    !property.selectedBuyerId
  )
    throw new ServiceError('Select and verify a buyer first');
  if (to === 'OFFER READY FOR APPROVAL' && !property.underwrittenAt)
    throw new ServiceError('Underwriting is required before offer approval');
  const errors = validateTransition(
    { ...property, ...patch, stage: property.stage, buyerId: property.selectedBuyerId },
    to,
    context,
  );
  if (errors.length) throw new ServiceError(errors.join('; '), 400, errors);
  const saved = await update(db, 'properties', property, patch);
  if (to === 'UNDER CONTRACT') {
    if (!deadlineRows.some((d) => d.type === 'CLOSING'))
      await insert(db, 'deadlines', mode, {
        propertyId: property.id,
        type: 'CLOSING',
        dueDate: input.closingDate,
        status: 'OPEN',
      });
    if (input.inspectionDeadline)
      await insert(db, 'deadlines', mode, {
        propertyId: property.id,
        type: 'INSPECTION',
        dueDate: input.inspectionDeadline,
        status: 'OPEN',
      });
    const existing = await db.query('SELECT id FROM closings WHERE property_id=$1', [property.id]);
    if (!existing.rowCount)
      await insert(db, 'closings', mode, {
        propertyId: property.id,
        titleStatus: 'TITLE OPEN',
        closingDate: input.closingDate,
        fundingStatus: 'PENDING',
        openedAt: stamp(),
        notes: 'Owner recorded externally executed contract',
      });
    await enqueue(db, mode, 'ESCROW', property.id, `contract-escrow:${property.id}`);
    await enqueue(db, mode, 'BRIDGE', property.id, `contract-bridge:${property.id}`);
    await createTask(db, mode, {
      propertyId: property.id,
      title: 'Confirm title opening with closing professional',
      priority: 'HIGH',
      department: 'ESCROW',
      assignedAgent: 'ESCROW',
      dueDate: input.executionDate,
      dedupeKey: `title:${property.id}`,
    });
  }
  if (['LOST', 'DEAD'].includes(to))
    await enqueue(db, mode, 'FORGE', property.id, `postmortem:${property.id}:${to}`);
  await audit(
    db,
    actor,
    mode,
    'STAGE_CHANGED',
    'properties',
    property.id,
    { stage: property.stage },
    patch,
    input.reason ?? `Owner moved deal to ${to}`,
    property.id,
  );
  return saved;
}
async function selectBuyer(db: DB, actor: Actor, mode: Mode, input: R) {
  requireOwner(actor);
  const property = await one(db, 'properties', input.propertyId, mode, true);
  const buyer = await one(db, 'buyers', input.buyerId, mode);
  if (['CLOSED', 'DEAD', 'LOST', 'ON HOLD'].includes(property.stage))
    throw new ServiceError('Terminal or on-hold deals cannot commit a buyer');
  if (!property.contractApproved)
    throw new ServiceError('Record the approved signed contract before committing a buyer');
  if (buyer.tier === 'BLOCKED' || buyer.doNotContact)
    throw new ServiceError('Buyer is blocked or opted out');
  if (
    buyer.proofOfFundsStatus !== 'VERIFIED' ||
    !dateValid(buyer.proofOfFundsExpiry) ||
    Date.parse(buyer.proofOfFundsExpiry) < Date.now()
  )
    throw new ServiceError('Buyer needs verified, current proof of funds');
  const match = matchBuyer(property, buyer, (await getSettings(db, mode)).buyerWeights);
  if (!match.eligible) throw new ServiceError('Buyer is not eligible for this property');
  if (
    !positive(property.contractPrice) ||
    !dateValid(property.executionDate) ||
    !property.signedDocumentId
  )
    throw new ServiceError('Complete signed contract evidence is required');
  const signed = await one(db, 'documents', property.signedDocumentId, mode);
  if (signed.status !== 'SIGNED' || signed.propertyId !== property.id)
    throw new ServiceError('Signed contract evidence is invalid');
  const assignmentPrice = money(
    input.assignmentPrice ??
      property.targetAssignmentPrice ??
      number(property.contractPrice) + number(property.projectedAssignmentFee),
  );
  if (assignmentPrice <= number(property.contractPrice))
    throw new ServiceError('Assignment price must exceed contract price');
  if (assignmentPrice > number(property.investorMax) && !input.overrideReason)
    throw new ServiceError(
      'Assignment price exceeds investor maximum; owner overrideReason required',
    );
  const saved = await update(db, 'properties', property, {
    targetAssignmentPrice: assignmentPrice,
    projectedAssignmentFee: money(assignmentPrice - number(property.contractPrice)),
    selectedBuyerId: buyer.id,
    buyerId: buyer.id,
    stage: 'BUYER COMMITTED',
    buyerCommittedAt: stamp(),
    nextAction: 'Prepare assignment workflow for owner and attorney review',
  });
  await createTask(db, mode, {
    propertyId: property.id,
    buyerId: buyer.id,
    title: 'Assignment preparation — obtain approved template and owner approval',
    department: 'GUARD',
    assignedAgent: 'GUARD',
    priority: 'HIGH',
    status: mode === 'LIVE' ? 'BLOCKED' : 'READY',
    dedupeKey: `assignment:${property.id}:${buyer.id}`,
  });
  await enqueue(db, mode, 'GUARD', property.id, `buyer-guard:${property.id}:${buyer.id}`);
  await enqueue(db, mode, 'ESCROW', property.id, `buyer-escrow:${property.id}:${buyer.id}`);
  await audit(
    db,
    actor,
    mode,
    'BUYER_SELECTED',
    'properties',
    property.id,
    { selectedBuyerId: property.selectedBuyerId },
    { selectedBuyerId: buyer.id, match },
    input.reason ?? 'Owner selected qualified buyer',
    property.id,
  );
  return saved;
}
async function closeDeal(db: DB, actor: Actor, mode: Mode, input: R) {
  requireOwner(actor);
  const property = await one(db, 'properties', input.propertyId, mode, true);
  if (property.stage === 'CLOSED') throw new ServiceError('Deal is already closed', 409);
  if (!property.contractApproved || !property.selectedBuyerId)
    throw new ServiceError('Approved contract and committed buyer required');
  if (!['BUYER COMMITTED', 'ASSIGNMENT PREPARATION', 'CLOSING'].includes(property.stage))
    throw new ServiceError('Deal must be in buyer commitment or closing workflow');
  if (
    !positive(property.contractPrice) ||
    !dateValid(property.executionDate) ||
    !property.signedDocumentId
  )
    throw new ServiceError('Complete contract evidence required');
  const signed = await one(db, 'documents', property.signedDocumentId, mode);
  if (signed.status !== 'SIGNED' || signed.propertyId !== property.id)
    throw new ServiceError('Signed contract evidence is invalid');
  const selectedBuyer = await one(db, 'buyers', property.selectedBuyerId, mode);
  if (
    selectedBuyer.tier === 'BLOCKED' ||
    selectedBuyer.doNotContact ||
    selectedBuyer.proofOfFundsStatus !== 'VERIFIED' ||
    !dateValid(selectedBuyer.proofOfFundsExpiry) ||
    Date.parse(selectedBuyer.proofOfFundsExpiry) < Date.now()
  )
    throw new ServiceError('Committed buyer is blocked or proof of funds expired');
  const closings = (await rows(db, 'closings', mode)).filter((c) => c.propertyId === property.id);
  const closing = closings[0];
  if (!closing || !['CLEAR', 'SCHEDULED', 'FUNDED'].includes(closing.titleStatus))
    throw new ServiceError('Title must be CLEAR, SCHEDULED or FUNDED before closing');
  if (!positive(input.amount) || !dateValid(input.date))
    throw new ServiceError('Positive realized assignment fee and closing date required');
  if (Date.parse(input.date) > Date.now())
    throw new ServiceError('Cannot record realized revenue for a future closing');
  if (Date.parse(input.date) < Date.parse(property.executionDate))
    throw new ServiceError('Closing cannot precede contract execution');
  if (!input.fundingConfirmed)
    throw new ServiceError(
      'Owner must confirm funds were received; this application never moves money',
    );
  const amount = money(input.amount);
  const reference = `closing:${property.id}`;
  const entry = await insert(db, 'transactions', mode, {
    propertyId: property.id,
    buyerId: property.selectedBuyerId,
    type: 'REVENUE',
    category: 'Assignment Fee',
    amount,
    date: input.date,
    description: 'Owner-reconciled realized assignment fee',
    reference,
    recordedBy: actor.email,
  });
  const saved = await update(db, 'properties', property, {
    stage: 'CLOSED',
    closedAt: input.date,
    closingDate: input.date,
    actualAssignmentFee: amount,
    probability: 100,
    weightedPipeline: 0,
    nextAction: 'Review postmortem and follow up with buyer',
  });
  await update(db, 'closings', closing, {
    titleStatus: 'CLOSED',
    fundingStatus: 'FUNDED',
    closingDate: input.date,
    closedBy: actor.email,
  });
  const buyer = await one(db, 'buyers', property.selectedBuyerId, mode, true);
  await update(db, 'buyers', buyer, {
    dealsPurchased: number(buyer.dealsPurchased) + 1,
    reliabilityScore: Math.min(100, number(buyer.reliabilityScore, 50) + 10),
    lastPurchaseDate: input.date,
  });
  for (const days of [7, 30, 90])
    await createTask(db, mode, {
      propertyId: property.id,
      buyerId: buyer.id,
      title: `${days}-day buyer relationship follow-up`,
      department: 'BRIDGE',
      assignedAgent: 'RELATIONSHIP MANAGER',
      dueDate: new Date(Date.parse(input.date) + days * DAY).toISOString(),
      dedupeKey: `relationship:${property.id}:${days}`,
    });
  await db.query(
    'UPDATE deadlines SET data=data||\'{"status":"DONE"}\'::jsonb,updated_at=now() WHERE property_id=$1 AND mode=$2',
    [property.id, mode],
  );
  await enqueue(db, mode, 'LEDGER', property.id, `closed-ledger:${property.id}`);
  await enqueue(db, mode, 'FORGE', property.id, `closed-forge:${property.id}`);
  await audit(
    db,
    actor,
    mode,
    'CLOSING_RECONCILED',
    'properties',
    property.id,
    property,
    { ...saved, transactionId: entry.id },
    input.reason ?? 'Owner confirmed received funds and closing',
    property.id,
  );
  return saved;
}

async function scanOperations(db: DB, mode: Mode) {
  const properties = await rows(db, 'properties', mode);
  const buyers = await rows(db, 'buyers', mode);
  let issues = 0;
  for (const property of properties.filter((p) => !['CLOSED', 'DEAD', 'LOST'].includes(p.stage))) {
    const reasons: string[] = [];
    if (!property.ownershipVerified) reasons.push('Ownership not verified');
    if (!property.arvBase) reasons.push('Missing sourced ARV');
    if (property.updatedAt && Date.now() - Date.parse(property.updatedAt) > 14 * DAY)
      reasons.push('Stale property record');
    if (property.riskGrade === 'RED') reasons.push('Red Team blockers unresolved');
    for (const reason of reasons) {
      issues++;
      await createTask(db, mode, {
        propertyId: property.id,
        title: reason,
        department: 'OPS',
        assignedAgent: 'INSPECTOR',
        priority: reason.includes('Red') ? 'HIGH' : 'MEDIUM',
        dedupeKey: `quality:${property.id}:${reason}`,
      });
    }
  }
  for (const buyer of buyers)
    if (
      buyer.proofOfFundsStatus === 'VERIFIED' &&
      (!dateValid(buyer.proofOfFundsExpiry) || Date.parse(buyer.proofOfFundsExpiry) < Date.now())
    ) {
      issues++;
      await createTask(db, mode, {
        buyerId: buyer.id,
        title: `Refresh proof of funds: ${buyer.name}`,
        department: 'BRIDGE',
        assignedAgent: 'BUYER PERFORMANCE',
        dedupeKey: `pof:${buyer.id}:${buyer.proofOfFundsExpiry}`,
      });
    }
  return {
    issues,
    dataHealthScore: Math.max(0, 100 - Math.round((issues / Math.max(1, properties.length)) * 20)),
    propertiesReviewed: properties.length,
    buyersReviewed: buyers.length,
  };
}
async function scanDeadlines(db: DB, mode: Mode) {
  const settings = await getSettings(db, mode);
  const deadlines = await rows(db, 'deadlines', mode);
  let count = 0;
  for (const deadline of deadlines.filter((d) => d.status !== 'DONE')) {
    const days = (Date.parse(deadline.dueDate) - Date.now()) / DAY;
    for (const threshold of settings.notificationThresholds ?? [14, 7, 3, 1])
      if (days <= number(threshold)) {
        await notify(db, mode, {
          propertyId: deadline.propertyId,
          title: `${deadline.type} ${days < 0 ? 'overdue' : `due within ${threshold} day(s)`}`,
          severity: days <= 1 ? 'HIGH' : 'WARNING',
          dueDate: deadline.dueDate,
          dedupeKey: `deadline:${deadline.id}:${deadline.dueDate}:${threshold}`,
        });
        count++;
      }
  }
  const sellers = await rows(db, 'sellers', mode);
  for (const seller of sellers) {
    if (
      seller.doNotContact ||
      seller.status === 'DO NOT CONTACT' ||
      ['DEAD', 'CLOSED'].includes(seller.status)
    )
      continue;
    if (!['HOT', 'WARM', 'NURTURE'].includes(seller.status)) continue;
    const interval = number(settings.followUpIntervals?.[seller.status], 7);
    const last = seller.lastContact ?? seller.createdAt;
    const due = seller.nextFollowUp ?? new Date(Date.parse(last) + interval * DAY).toISOString();
    if (Date.parse(due) <= Date.now() + DAY)
      await createTask(db, mode, {
        sellerId: seller.id,
        title: `Follow up with ${seller.name}`,
        description: 'Internal reminder only. Check consent before any outreach.',
        department: 'CLOSER',
        assignedAgent: 'FOLLOW-UP',
        dueDate: due,
        dedupeKey: `followup:${seller.id}:${due}`,
      });
  }
  return { deadlinesReviewed: deadlines.length, notificationsEvaluated: count };
}
async function postmortem(db: DB, property: R, mode: Mode) {
  const activities = (
    await db.query('SELECT * FROM audit_log WHERE mode=$1 AND property_id=$2 ORDER BY created_at', [
      mode,
      property.id,
    ])
  ).rows;
  const expenses = calculatePnl(
    (await rows(db, 'transactions', mode)).filter((t) => t.propertyId === property.id),
    [property],
  ).expenses;
  const matches = (await rows(db, 'matches', mode)).filter((m) => m.propertyId === property.id);
  const durations: R = {};
  const stageChanges = activities.filter((a) => a.action === 'STAGE_CHANGED');
  for (let i = 0; i < stageChanges.length; i++) {
    const start = stageChanges[i];
    const end = stageChanges[i + 1];
    durations[start.new_value?.stage ?? 'UNKNOWN'] =
      Math.round(
        (((end ? new Date(end.created_at).getTime() : Date.now()) -
          new Date(start.created_at).getTime()) /
          DAY) *
          10,
      ) / 10;
  }
  const output = {
    propertyId: property.id,
    dealId: property.dealId,
    leadSource: property.leadSource,
    outcome: property.stage,
    projectedFee: number(property.projectedAssignmentFee),
    actualFee: number(property.actualAssignmentFee),
    variance: money(number(property.actualAssignmentFee) - number(property.projectedAssignmentFee)),
    expenses: money(expenses),
    buyerInterest: matches.length,
    daysInStage: durations,
    reason: property.lossReason ?? property.notes ?? 'Owner review required',
    arvAccuracy: 'NOT VERIFIED — no independent resale observation',
    repairAccuracy: 'NOT VERIFIED — no actual rehab cost observation',
    recommendations: [
      number(property.actualAssignmentFee) < number(property.projectedAssignmentFee)
        ? 'Review assignment assumptions against realized fee'
        : 'Preserve sourced underwriting assumptions for comparison',
      'Refresh buyer preferences and record closing professional feedback',
    ],
    generatedAt: stamp(),
    policyChanged: false,
  };
  await update(db, 'properties', property, { postmortem: output });
  return output;
}
async function executeAgent(
  db: DB,
  actor: Actor,
  mode: Mode,
  agentName: string,
  propertyId?: unknown,
) {
  const definition = AGENTS.find((a) => a.name === agentName);
  if (!definition) throw new ServiceError('Unknown agent');
  const status = await db.query('SELECT status FROM agent_status WHERE mode=$1 AND name=$2', [
    mode,
    agentName,
  ]);
  if (status.rows[0]?.status === 'PAUSED') throw new ServiceError(`${agentName} is paused`, 409);
  const property = propertyId ? await one(db, 'properties', propertyId, mode, true) : null;
  const inserted = await db.query(
    "INSERT INTO agent_runs(mode,property_id,agent,status) VALUES($1,$2,$3,'RUNNING') RETURNING id",
    [mode, property?.id ?? null, agentName],
  );
  const runId = inserted.rows[0].id;
  const agentActor = { id: `agent:${agentName}`, email: agentName, role: 'AGENT' };
  let output: R = {};
  if (['SCOUT', 'HUNTER', 'FILTER', 'WATCHTOWER'].includes(agentName)) {
    if (property) {
      const score = scoreLead(property, (await getSettings(db, mode)).leadWeights);
      await update(db, 'properties', property, { leadScore: score });
      output = {
        propertyId: property.id,
        leadScore: score,
        source: property.source ?? property.leadSource,
        confidence: property.ownershipConfidence ?? 0,
      };
    } else
      output = {
        status: 'NOT CONFIGURED',
        message: 'External property provider not configured. Manual and CSV import are available.',
      };
  } else if (['NINJA', 'OWNER', 'ENTITY', 'VERIFY'].includes(agentName)) {
    if (property && !property.ownershipVerified)
      await createTask(db, mode, {
        propertyId: property.id,
        title: 'Verify owner with lawful sourced records',
        department: 'NINJA',
        assignedAgent: 'VERIFY',
        status: 'BLOCKED',
        description:
          'Public-record provider NOT CONFIGURED. Owner may manually record sourced verification.',
        dedupeKey: `ownership:${property.id}`,
      });
    output = {
      status: property?.ownershipVerified ? 'VERIFIED' : 'NOT CONFIGURED',
      source: property?.ownershipSource ?? null,
      message: 'No ownership inference or private-data access performed',
    };
  } else if (['COMPS', 'COMPASS'].includes(agentName)) {
    if (!property) throw new ServiceError('Select a property for comparable-sales review');
    const comparableSales = (await rows(db, 'comps', mode)).filter(
      (c) => c.propertyId === property.id,
    );
    if (!comparableSales.length)
      output = {
        status: 'BLOCKED',
        message:
          'No sourced comparable sales. Property-data provider NOT CONFIGURED; add manual sourced comps.',
      };
    else {
      output = calculateArv(property, comparableSales);
      await update(db, 'properties', property, {
        ...output,
        underwrittenAt: null,
        underwritingRevision: null,
        offerApproved: false,
        underwritingStale: true,
      });
      await enqueue(db, mode, 'NUMBERS', property.id, `comps-reviewed:${property.id}:${stamp()}`);
    }
  } else if (agentName === 'REHAB') {
    if (!property) throw new ServiceError('Select a property for repair estimation');
    const repairItems = (await rows(db, 'repairs', mode)).filter(
      (r) => r.propertyId === property.id,
    );
    if (!repairItems.length)
      output = {
        status: 'BLOCKED',
        message: 'No itemized repair assumptions; enter inspection or estimate allowances.',
      };
    else {
      output = calculateRepairs(
        repairItems,
        number((await getSettings(db, mode)).repairContingency, 15),
      );
      await update(db, 'properties', property, {
        ...output,
        underwrittenAt: null,
        underwritingRevision: null,
        offerApproved: false,
        underwritingStale: true,
      });
    }
  } else if (['ATLAS', 'TREND'].includes(agentName)) {
    const compData = (await rows(db, 'comps', mode)).filter(
      (c) => !property || c.propertyId === property.id,
    );
    const marketProperties = await rows(db, 'properties', mode);
    const settings = await getSettings(db, mode);
    const weights = { coverage: 40, recency: 30, buyerDemand: 30, ...settings.marketWeights };
    const coverage = Math.min(100, (compData.length / Math.max(1, marketProperties.length)) * 100);
    const recency = compData.length
      ? (compData.filter((c) => Date.now() - Date.parse(c.saleDate) < 180 * DAY).length /
          compData.length) *
        100
      : 0;
    const demand = Math.min(
      100,
      ((await rows(db, 'buyers', mode)).filter(
        (b) =>
          b.tier !== 'BLOCKED' &&
          b.proofOfFundsStatus === 'VERIFIED' &&
          dateValid(b.proofOfFundsExpiry) &&
          Date.parse(b.proofOfFundsExpiry) > Date.now(),
      ).length /
        Math.max(1, marketProperties.length)) *
        100,
    );
    const total = number(weights.coverage) + number(weights.recency) + number(weights.buyerDemand);
    output = {
      marketScore: total
        ? Math.round(
            (coverage * number(weights.coverage) +
              recency * number(weights.recency) +
              demand * number(weights.buyerDemand)) /
              total,
          )
        : 0,
      label: 'INTERNAL DATA COVERAGE / DEMAND SCORE',
      signals: { coverage, recency, buyerDemand: demand },
      weights,
      comparableSales: compData.length,
      caveat:
        'Not an external market valuation or liquidity estimate; limited to sourced records and buyer preferences in this workspace.',
      generatedAt: stamp(),
    };
    if (property) await update(db, 'properties', property, { marketReport: output });
  } else if (['NUMBERS', 'MAO'].includes(agentName)) {
    if (!property)
      output = {
        status: 'BLOCKED',
        message: 'Choose a property with sourced comps and repair assumptions.',
      };
    else {
      const result = await underwriting(db, agentActor, mode, property.id);
      output = {
        propertyId: property.id,
        mao: result.mao,
        arvBase: result.arvBase,
        repairExpected: result.repairExpected,
        riskGrade: result.riskGrade,
        scenarios: result.scenarios,
      };
    }
  } else if (agentName === 'RED TEAM') {
    if (!property) throw new ServiceError('Select a property for Red Team review');
    const comps = (await rows(db, 'comps', mode)).filter((c) => c.propertyId === property.id);
    output = redTeam(property, comps);
    await update(db, 'properties', property, {
      riskGrade: output.grade,
      riskReasons: output.reasons,
      riskMitigations: output.mitigations,
    });
  } else if (
    [
      'BRIDGE',
      'MATCHMAKER',
      'BUYER DNA',
      'BUYER SCOUT',
      'BUYER PERFORMANCE',
      'RELATIONSHIP MANAGER',
    ].includes(agentName)
  ) {
    if (property) output = { matches: await matching(db, agentActor, mode, property.id) };
    else output = { ...(await scanOperations(db, mode)) };
  } else if (['GUARD', 'CONTRACT OPS', 'COMPLIANCE MONITOR'].includes(agentName)) {
    const settings = await getSettings(db, mode);
    const blockers = property
      ? complianceBlockers(settings, property)
      : ['Select a property for jurisdiction review'];
    output = {
      status: blockers.length ? 'LEGAL REVIEW REQUIRED' : 'REVIEWED',
      blockers,
      externalExecutionEnabled: false,
    };
    if (property && blockers.length)
      await createTask(db, mode, {
        propertyId: property.id,
        title: 'LEGAL REVIEW REQUIRED',
        description: blockers.join('; '),
        department: 'GUARD',
        assignedAgent: 'GUARD',
        status: 'BLOCKED',
        priority: 'HIGH',
        dedupeKey: `legal:${property.id}`,
      });
  } else if (
    [
      'ESCROW',
      'TITLE WATCH',
      'DEADLINE',
      'CLOSING COORDINATOR',
      'FOLLOW-UP',
      'CLOSER',
      'QUALIFIER',
      'NEGOTIATOR',
      'SELLER EXPERIENCE',
    ].includes(agentName)
  ) {
    output = await scanDeadlines(db, mode);
    output.message = 'Internal tasks and alerts only; no external contact or binding actions';
  } else if (['LEDGER', 'FORECAST', 'CAC'].includes(agentName))
    output = calculatePnl(await rows(db, 'transactions', mode), await rows(db, 'properties', mode));
  else if (['OPS', 'INSPECTOR', 'CONTROL TOWER'].includes(agentName))
    output = { ...(await scanOperations(db, mode)), ...(await scanDeadlines(db, mode)) };
  else if (agentName === 'FORGE') {
    if (!property)
      throw new ServiceError('Select a closed, lost or failed property for postmortem');
    if (!['CLOSED', 'LOST', 'DEAD'].includes(property.stage))
      throw new ServiceError('Postmortem requires a closed, lost or dead deal');
    output = await postmortem(db, property, mode);
  } else throw new ServiceError('Agent has no implemented executor');
  const blocked = ['NOT CONFIGURED', 'LEGAL REVIEW REQUIRED', 'BLOCKED'].includes(
    String(output.status),
  );
  const runStatus = blocked ? 'BLOCKED' : 'COMPLETED';
  const structuredOutput = z
    .object({
      status: z.enum(['COMPLETED', 'BLOCKED', 'FAILED']),
      summary: z.string(),
      evidence: z.array(z.unknown()),
      recommendations: z.array(z.unknown()),
    })
    .strict()
    .parse({
      status: runStatus,
      summary:
        output.message ??
        `${agentName} ${blocked ? 'requires a prerequisite' : 'completed its internal deterministic review'}`,
      evidence: [output],
      recommendations: output.recommendations ?? output.mitigations ?? [],
    });
  if (blocked) {
    await createTask(db, mode, {
      propertyId: property?.id,
      title: `${agentName}: ${output.message ?? output.status}`,
      department: definition.department,
      assignedAgent: agentName,
      status: 'BLOCKED',
      priority: 'HIGH',
      description: JSON.stringify(output),
      dedupeKey: `agent-blocked:${agentName}:${property?.id ?? 'global'}`,
    });
  }
  await db.query('UPDATE agent_runs SET status=$1,output=$2,completed_at=now() WHERE id=$3', [
    runStatus,
    JSON.stringify(structuredOutput),
    runId,
  ]);
  await audit(
    db,
    agentActor,
    mode,
    blocked ? 'AGENT_BLOCKED' : 'AGENT_COMPLETED',
    'agent_runs',
    runId,
    null,
    structuredOutput,
    `Run requested by ${actor.email}`,
    property?.id ?? null,
    'DETERMINISTIC_AGENT',
  );
  return { id: runId, agent: agentName, status: runStatus, output: structuredOutput };
}

export async function runPendingJobs(mode: Mode, limit = 20) {
  return transaction(async (db) => {
    const settings = await getSettings(db, mode);
    if (settings.automationEnabled === false) return { processed: 0, results: [], paused: true };
    await scanDeadlines(db, mode);
    await scanOperations(db, mode);
    await db.query(
      "UPDATE jobs SET status='PENDING',locked_at=NULL,run_after=now(),updated_at=now() WHERE mode=$1 AND status='RUNNING' AND locked_at<now()-interval '10 minutes'",
      [mode],
    );
    const claimed = await db.query(
      "SELECT j.* FROM jobs j WHERE j.mode=$1 AND j.status='PENDING' AND j.run_after<=now() AND NOT EXISTS(SELECT 1 FROM agent_status a WHERE a.mode=j.mode AND a.name=j.kind AND a.status='PAUSED') ORDER BY j.created_at LIMIT $2 FOR UPDATE OF j SKIP LOCKED",
      [mode, Math.min(100, Math.max(1, limit))],
    );
    const results: R[] = [];
    for (const job of claimed.rows) {
      await db.query(
        "UPDATE jobs SET status='RUNNING',attempts=attempts+1,locked_at=now(),updated_at=now() WHERE id=$1",
        [job.id],
      );
      await db.query('SAVEPOINT job_work');
      try {
        const result = await executeAgent(
          db,
          { id: 'worker', email: 'CONTROL TOWER', role: 'OWNER' },
          mode,
          job.kind,
          job.property_id,
        );
        await db.query('RELEASE SAVEPOINT job_work');
        if (result.status === 'BLOCKED') {
          const detail = {
            message: 'Agent blocked by unavailable prerequisite',
            agent: job.kind,
            output: result.output,
            at: stamp(),
          };
          await db.query(
            "UPDATE jobs SET status='FAILED',locked_at=NULL,last_error=$1,updated_at=now() WHERE id=$2",
            [JSON.stringify(detail), job.id],
          );
          results.push({ id: job.id, status: 'BLOCKED', error: detail });
          continue;
        }
        await db.query(
          "UPDATE jobs SET status='COMPLETED',locked_at=NULL,updated_at=now(),last_error=NULL WHERE id=$1",
          [job.id],
        );
        results.push({ id: job.id, status: 'COMPLETED', result });
      } catch (error) {
        await db.query('ROLLBACK TO SAVEPOINT job_work');
        await db.query('RELEASE SAVEPOINT job_work');
        const failed = job.attempts + 1 >= job.max_attempts;
        const detail = {
          message: error instanceof Error ? error.message : 'Agent execution failed',
          at: stamp(),
          agent: job.kind,
          attempt: job.attempts + 1,
        };
        await db.query(
          "UPDATE jobs SET status=$1,locked_at=NULL,last_error=$2,run_after=now()+($3*interval '1 second'),updated_at=now() WHERE id=$4",
          [
            failed ? 'FAILED' : 'PENDING',
            JSON.stringify(detail),
            Math.pow(2, job.attempts + 1) * 30,
            job.id,
          ],
        );
        await db.query(
          "INSERT INTO agent_runs(mode,property_id,agent,status,error,completed_at) VALUES($1,$2,$3,'FAILED',$4,now())",
          [mode, job.property_id, job.kind, JSON.stringify(detail)],
        );
        if (failed)
          await notify(db, mode, {
            propertyId: job.property_id,
            title: `Agent failed: ${job.kind}`,
            severity: 'HIGH',
            error: detail,
            dedupeKey: `job-failed:${job.id}`,
          });
        results.push({ id: job.id, status: failed ? 'FAILED' : 'RETRY', error: detail });
      }
    }
    return { processed: results.length, results };
  });
}

function parseCsv(input: string): R[] {
  if (input.length > 1_000_000) throw new ServiceError('CSV exceeds 1MB limit');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new ServiceError('CSV contains an unterminated quoted field');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((h) => h.trim()) ?? [];
  if (!['address', 'city', 'state', 'zip'].every((h) => headers.includes(h)))
    throw new ServiceError('CSV headers must include address,city,state,zip');
  if (rows.length > 1000) throw new ServiceError('Import at most 1000 rows at a time');
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new ServiceError(`CSV row ${index + 2} field count differs from header`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i].trim()]));
  });
}
async function updateSettings(db: DB, actor: Actor, mode: Mode, input: R) {
  requireOwner(actor);
  if (!input.settings || typeof input.settings !== 'object')
    throw new ServiceError('settings object required');
  const old = await getSettings(db, mode);
  const next = { ...old, ...input.settings };
  validateNumbers(next, [
    'minimumAssignmentFee',
    'targetInvestorMargin',
    'repairContingency',
    'riskAllowance',
    'holdingCosts',
    'transactionCosts',
  ]);
  if (number(next.targetInvestorMargin) > 100 || number(next.repairContingency) > 100)
    throw new ServiceError('Percentages must be between 0 and 100');
  try {
    new Intl.DateTimeFormat('en', { timeZone: next.ownerTimezone });
  } catch {
    throw new ServiceError('Valid owner timezone required');
  }
  if (next.externalOutreachEnabled)
    throw new ServiceError(
      'External outreach provider NOT CONFIGURED; automation cannot be enabled',
    );
  const economicKeys = [
    'minimumAssignmentFee',
    'targetInvestorMargin',
    'repairContingency',
    'riskAllowance',
    'holdingCosts',
    'transactionCosts',
    'buyerWeights',
    'leadWeights',
    'jurisdictionRules',
  ];
  const changes = economicKeys.filter((k) => JSON.stringify(next[k]) !== JSON.stringify(old[k]));
  if (changes.length && old.onboardingComplete && !input.ownerApproved) {
    const approval = await insert(db, 'approvals', mode, {
      action: 'PROPOSED POLICY CHANGE',
      status: 'PENDING',
      reason: input.reason ?? 'Owner settings change requires approval',
      risk: 'HIGH',
      financialImpact: 'Affects future underwriting and matching',
      payload: { settings: input.settings },
      supportingData: { changedFields: changes },
      requestedBy: actor.email,
    });
    await audit(
      db,
      actor,
      mode,
      'POLICY_CHANGE_PROPOSED',
      'approvals',
      approval.id,
      old,
      input.settings,
      input.reason ?? '',
    );
    return { approval, pendingApproval: true };
  }
  await db.query(
    'INSERT INTO settings(mode,data) VALUES($1,$2) ON CONFLICT(mode) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',
    [mode, JSON.stringify(next)],
  );
  await audit(
    db,
    actor,
    mode,
    'SETTINGS_UPDATED',
    'settings',
    null,
    old,
    next,
    input.reason ?? 'Owner configured business settings',
  );
  return next;
}

export async function executeAction(actor: Actor, input: R): Promise<any> {
  const mode = validMode(input.mode);
  if (!actor?.id) throw new ServiceError('Authentication required', 401);
  if (!['OWNER', 'OPERATOR', 'VIEWER'].includes(actor.role))
    throw new ServiceError('Unknown role', 403);
  if (actor.role === 'VIEWER') throw new ServiceError('Read-only user cannot change records', 403);
  if (typeof input.action !== 'string') throw new ServiceError('action required');
  if (input.action === 'runJobs') {
    requireOwner(actor);
    return runPendingJobs(mode);
  }
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ ...input, idempotencyKey: undefined }))
    .digest('hex');
  try {
    return await transaction(async (db) => {
      if (input.idempotencyKey) {
        if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length > 200)
          throw new ServiceError('Invalid idempotency key');
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `${mode}:${actor.id}:${input.idempotencyKey}`,
        ]);
        const prior = await db.query(
          'SELECT * FROM idempotency WHERE mode=$1 AND actor=$2 AND key=$3',
          [mode, actor.id, input.idempotencyKey],
        );
        if (prior.rowCount) {
          if (prior.rows[0].request_hash !== requestHash)
            throw new ServiceError('Idempotency key reused for a different request', 409);
          return prior.rows[0].response;
        }
      }
      let result: any;
      switch (input.action) {
        case 'uploadFile': {
          requireOwner(actor);
          const file = input.file;
          const bytes = Buffer.from(String(file?.bytesBase64 ?? ''), 'base64');
          if (!bytes.length || bytes.length > 10 * 1024 * 1024)
            throw new ServiceError('Upload must be between 1 byte and 10MB');
          const sha = createHash('sha256').update(bytes).digest('hex');
          if (sha !== file.sha256) throw new ServiceError('Upload checksum mismatch');
          if (
            !['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv'].includes(
              file.mimeType,
            )
          )
            throw new ServiceError('Unsupported file type');
          result = await saveRecord(db, actor, mode, 'documents', input.record);
          await db.query(
            'INSERT INTO document_files(document_id,mode,filename,mime_type,bytes,sha256) VALUES($1,$2,$3,$4,$5,$6)',
            [
              result.id,
              mode,
              String(file.filename)
                .replace(/[\/\\]/g, '_')
                .slice(0, 200),
              file.mimeType,
              bytes,
              sha,
            ],
          );
          break;
        }
        case 'save':
          result = await saveRecord(db, actor, mode, input.entity, input.record);
          break;
        case 'underwriting':
          result = await underwriting(db, actor, mode, input.propertyId);
          break;
        case 'match':
          result = await matching(db, actor, mode, input.propertyId);
          break;
        case 'requestOffer':
          result = await requestOffer(db, actor, mode, input);
          break;
        case 'approval':
          result = await decideApproval(db, actor, mode, input);
          break;
        case 'transition':
          result = await transition(db, actor, mode, input);
          break;
        case 'selectBuyer':
          result = await selectBuyer(db, actor, mode, input);
          break;
        case 'close':
          result = await closeDeal(db, actor, mode, input);
          break;
        case 'settings':
          result = await updateSettings(db, actor, mode, input);
          break;
        case 'runAgent': {
          await db.query('SAVEPOINT manual_agent');
          try {
            result = await executeAgent(db, actor, mode, String(input.agent), input.propertyId);
            await db.query('RELEASE SAVEPOINT manual_agent');
          } catch (error) {
            await db.query('ROLLBACK TO SAVEPOINT manual_agent');
            await db.query('RELEASE SAVEPOINT manual_agent');
            const detail = {
              message: error instanceof Error ? error.message : 'Agent failed',
              at: stamp(),
            };
            const run = await db.query(
              "INSERT INTO agent_runs(mode,property_id,agent,status,error,completed_at) VALUES($1,$2,$3,'FAILED',$4,now()) RETURNING id",
              [
                mode,
                input.propertyId ? validId(input.propertyId) : null,
                String(input.agent),
                JSON.stringify(detail),
              ],
            );
            await audit(
              db,
              actor,
              mode,
              'AGENT_FAILED',
              'agent_runs',
              run.rows[0].id,
              null,
              detail,
              'Manual agent run failed',
              input.propertyId ?? null,
            );
            result = { id: run.rows[0].id, status: 'FAILED', error: detail };
          }
          break;
        }
        case 'agentStatus': {
          requireOwner(actor);
          if (
            !AGENTS.some((a) => a.name === input.agent) ||
            !['ACTIVE', 'PAUSED'].includes(input.status)
          )
            throw new ServiceError('Valid agent and ACTIVE or PAUSED required');
          await db.query(
            'INSERT INTO agent_status(mode,name,status) VALUES($1,$2,$3) ON CONFLICT(mode,name) DO UPDATE SET status=EXCLUDED.status,updated_at=now()',
            [mode, input.agent, input.status],
          );
          await audit(db, actor, mode, 'AGENT_STATUS_CHANGED', 'agent_status', null, null, {
            agent: input.agent,
            status: input.status,
          });
          result = { agent: input.agent, status: input.status };
          break;
        }
        case 'taskStatus': {
          if (!TASK_STATUSES.includes(input.status)) throw new ServiceError('Invalid task status');
          const task = await one(db, 'tasks', input.id, mode, true);
          if (input.status === 'DONE' && task.dependencyId) {
            const dependency = await one(db, 'tasks', task.dependencyId, mode);
            if (dependency.status !== 'DONE')
              throw new ServiceError('Task dependency is incomplete');
          }
          result = await update(db, 'tasks', task, {
            status: input.status,
            completedAt: input.status === 'DONE' ? stamp() : null,
          });
          await audit(
            db,
            actor,
            mode,
            'TASK_STATUS_CHANGED',
            'tasks',
            task.id,
            task,
            result,
            '',
            task.propertyId ?? null,
          );
          break;
        }
        case 'notificationRead': {
          const notification = await one(db, 'notifications', input.id, mode, true);
          result = await update(db, 'notifications', notification, { read: true });
          break;
        }
        case 'import': {
          const records = parseCsv(String(input.csv ?? ''));
          const imported: R[] = [];
          const skipped: R[] = [];
          const existing = await rows(db, 'properties', mode);
          for (const record of records) {
            if (
              existing.some(
                (p) =>
                  normalized(p.address) === normalized(record.address) &&
                  normalized(p.city) === normalized(record.city) &&
                  normalized(p.state) === normalized(record.state) &&
                  p.zip === record.zip,
              )
            ) {
              skipped.push({ address: record.address, reason: 'Duplicate property' });
              continue;
            }
            const saved = await saveRecord(db, actor, mode, 'properties', {
              ...record,
              leadSource: record.leadSource || 'CSV import',
              source: record.source || 'Owner CSV upload',
            });
            imported.push(saved);
            existing.push(saved);
          }
          result = { imported: imported.length, skipped, records: imported };
          break;
        }
        case 'scan':
          result = { ...(await scanOperations(db, mode)), ...(await scanDeadlines(db, mode)) };
          break;
        default:
          throw new ServiceError('Unknown action');
      }
      if (input.idempotencyKey)
        await db.query(
          'INSERT INTO idempotency(mode,actor,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
          [mode, actor.id, input.idempotencyKey, requestHash, JSON.stringify(result)],
        );
      return result;
    });
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505')
      throw new ServiceError('Duplicate record or reference already exists', 409);
    if (pgError.code === '23503')
      throw new ServiceError('Referenced record is missing or belongs to another mode');
    throw error;
  }
}

export async function getState(rawMode: Mode): Promise<R> {
  const mode = validMode(rawMode);
  const entityResults = await Promise.all(ENTITY_TABLES.map((entity) => rows(pool, entity, mode)));
  const all = Object.fromEntries(
    ENTITY_TABLES.map((entity, i) => [entity, entityResults[i]]),
  ) as Record<Entity, R[]>;
  const settings = await getSettings(pool, mode);
  const [auditResult, runResult, statusResult, jobResult, errorResult] = await Promise.all([
    pool.query('SELECT * FROM audit_log WHERE mode=$1 ORDER BY created_at DESC LIMIT 1000', [mode]),
    pool.query('SELECT * FROM agent_runs WHERE mode=$1 ORDER BY started_at DESC LIMIT 500', [mode]),
    pool.query('SELECT * FROM agent_status WHERE mode=$1', [mode]),
    pool.query('SELECT * FROM jobs WHERE mode=$1 ORDER BY created_at DESC LIMIT 200', [mode]),
    pool.query('SELECT * FROM operation_errors WHERE mode=$1 ORDER BY created_at DESC LIMIT 200', [
      mode,
    ]),
  ]);
  const properties = all.properties;
  const terminal = ['CLOSED', 'DEAD', 'LOST'];
  const active = properties.filter((p) => !terminal.includes(p.stage));
  const contracted = properties.filter((p) => p.contractApproved || number(p.contractPrice) > 0);
  const closed = properties.filter((p) => p.stage === 'CLOSED');
  const pnl = calculatePnl(all.transactions, properties);
  const totals: R = {};
  for (const stage of STAGES) totals[stage] = properties.filter((p) => p.stage === stage).length;
  const projectedRevenue = pnl.projectedRevenue;
  const weightedPipeline = pnl.weightedPipeline;
  const revenue = pnl.revenue;
  const expenses = pnl.expenses;
  const sourceNames = [...new Set(properties.map((p) => p.leadSource ?? 'Manual'))];
  const sources = sourceNames.map((source) => {
    const sourceProperties = properties.filter((p) => p.leadSource === source);
    const ids = new Set(sourceProperties.map((p) => p.id));
    const sourcePnl = calculatePnl(
      all.transactions.filter((t) => t.leadSource === source || ids.has(t.propertyId)),
      sourceProperties,
    );
    const sourceCosts = sourcePnl.expenses;
    const sourceRevenue = sourcePnl.revenue;
    return {
      source,
      count: sourceProperties.length,
      leads: sourceProperties.length,
      closed: sourceProperties.filter((p) => p.stage === 'CLOSED').length,
      revenue: sourceRevenue,
      expenses: sourceCosts,
      roi: sourceCosts ? Math.round(((sourceRevenue - sourceCosts) / sourceCosts) * 100) : null,
    };
  });
  const month = new Date().toISOString().slice(0, 7);
  const qualityIssues = active.filter(
    (p) => !p.ownershipVerified || !p.arvBase || p.riskGrade === 'RED',
  ).length;
  const agentRuns = runResult.rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    propertyId: r.property_id,
    agent: r.agent,
    status: r.status,
    output: r.output,
    error: r.error,
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at?.toISOString(),
    durationMs: r.completed_at
      ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
      : null,
  }));
  const agents = AGENTS.map((definition) => {
    const runs = agentRuns.filter((r) => r.agent === definition.name);
    const completed = runs.filter((r) => r.status === 'COMPLETED');
    const failed = runs.filter((r) => r.status === 'FAILED');
    const status = statusResult.rows.find((s) => s.name === definition.name)?.status ?? 'ACTIVE';
    return {
      ...definition,
      id: definition.name,
      status,
      completed: completed.length,
      tasksCompleted: completed.length,
      tasksFailed: failed.length,
      failed: failed.length,
      lastActivity: runs[0]?.startedAt ?? null,
      currentTask: runs.find((r) => r.status === 'RUNNING')?.propertyId ?? null,
      averageCompletionTime: completed.length
        ? Math.round(completed.reduce((s, r) => s + number(r.durationMs), 0) / completed.length)
        : 0,
      errorRate: runs.length ? Math.round((failed.length / runs.length) * 100) : 0,
      pendingApprovals: all.approvals.filter((a) => a.status === 'PENDING').length,
      lastOutput: runs[0]?.output ?? null,
      lastError: runs[0]?.error ?? null,
    };
  });
  const activities = auditResult.rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    actor: r.actor,
    actorType: r.actor_type,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    propertyId: r.property_id,
    oldValue: r.old_value,
    newValue: r.new_value,
    reason: r.reason,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    timestamp: r.created_at.toISOString(),
  }));
  const integrations = [
    'Property data',
    'Public records',
    'Email',
    'SMS',
    'Maps / geocoding',
    'Calendar',
    'AI provider',
  ].map((name) => ({
    id: name,
    name,
    status: 'NOT CONFIGURED',
    provider: null,
    mode,
    description:
      mode === 'DEMO'
        ? 'Manual data and clearly labeled demo records available'
        : 'Configure approved provider credentials before external access',
  }));
  integrations.push({
    id: 'Documents',
    name: 'Document storage',
    status: 'LOCAL TEXT / REFERENCES',
    provider: null,
    mode,
    description: 'Owner-supplied document references and text. Remote storage NOT CONFIGURED.',
  });
  const automations = [
    {
      id: 'new-lead',
      name: 'New lead → SCOUT validation',
      trigger: 'PROPERTY CREATED',
      agent: 'SCOUT',
    },
    {
      id: 'owner-verified',
      name: 'Verified owner → comps review',
      trigger: 'OWNER VERIFIED',
      agent: 'COMPS',
    },
    {
      id: 'comps-ready',
      name: 'Comps / repairs changed → NUMBERS',
      trigger: 'COMPS READY',
      agent: 'NUMBERS',
    },
    {
      id: 'contract',
      name: 'Contract recorded → ESCROW + BRIDGE',
      trigger: 'UNDER CONTRACT',
      agent: 'BRIDGE',
    },
    {
      id: 'buyer',
      name: 'Buyer committed → GUARD + ESCROW',
      trigger: 'BUYER COMMITTED',
      agent: 'GUARD',
    },
    { id: 'closing', name: 'Closing recorded → LEDGER + FORGE', trigger: 'CLOSED', agent: 'FORGE' },
    {
      id: 'deadlines',
      name: 'Deadlines and seller follow-up → internal reminders',
      trigger: 'SCHEDULED',
      agent: 'CONTROL TOWER',
    },
  ].map((a) => ({
    ...a,
    enabled: settings.automationEnabled !== false,
    external: false,
    status: 'ACTIVE',
  }));
  const compliance = properties
    .filter((p) => !terminal.includes(p.stage))
    .map((p) => ({
      id: p.id,
      propertyId: p.id,
      dealId: p.dealId,
      state: p.state,
      status: mode === 'DEMO' ? 'DEMO — REVIEW REQUIRED' : 'LEGAL REVIEW REQUIRED',
      blockers: complianceBlockers(settings, p),
      jurisdiction: p.state,
      lastReviewedAt: null,
    }));
  const jobs = jobResult.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    propertyId: r.property_id,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAfter: r.run_after.toISOString(),
    lastError: r.last_error,
    createdAt: r.created_at.toISOString(),
  }));
  return {
    ...all,
    mode,
    settings,
    activities,
    agentRuns,
    agents,
    integrations,
    automations,
    compliance,
    jobs,
    operationErrors: errorResult.rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      actor: r.actor,
      action: r.action,
      entityId: r.entity_id,
      error: r.error,
      createdAt: r.created_at.toISOString(),
    })),
    propertyFinancials: Object.fromEntries(
      properties.map((p) => [
        p.id,
        calculatePnl(
          all.transactions.filter((t) => t.propertyId === p.id),
          [p],
        ),
      ]),
    ),
    financialPeriods: Object.fromEntries(
      ['CURRENT MONTH', 'LAST MONTH', 'QUARTER', 'YEAR TO DATE', 'ALL TIME'].map((period) => [
        period,
        calculatePnl(all.transactions, properties, period),
      ]),
    ),
    summary: {
      ...pnl,
      activeLeads: active.length,
      qualifiedLeads: active.filter((p) => number(p.leadScore) >= 65).length,
      sellersInConversation: all.sellers.filter((s) =>
        ['CONNECTED', 'QUALIFIED', 'HOT', 'WARM', 'NEGOTIATING'].includes(s.status),
      ).length,
      offersSent: properties.filter(
        (p) => p.stage === 'OFFER SENT' || p.offerDeliveryStatus === 'DEMO SIMULATED',
      ).length,
      underContract: contracted.filter((p) => p.stage !== 'CLOSED').length,
      inDispositions: active.filter((p) =>
        ['DISPOSITIONS', 'BUYER MATCHING', 'BUYER COMMITTED', 'ASSIGNMENT PREPARATION'].includes(
          p.stage,
        ),
      ).length,
      buyerCommitted: active.filter((p) => p.selectedBuyerId).length,
      upcomingClosings: all.closings.filter((c) => c.titleStatus !== 'CLOSED').length,
      closedThisMonth: closed.filter((p) => (p.closedAt ?? p.closingDate ?? '').startsWith(month))
        .length,
      totalClosed: closed.length,
      projectedRevenue,
      projectedAssignmentRevenue: projectedRevenue,
      weightedPipeline,
      actualRevenue: revenue,
      revenue,
      totalExpenses: expenses,
      expenses,
      netProfit: money(revenue - expenses),
      averageAssignmentFee: pnl.averageFee,
      costPerLead: pnl.costPerLead,
      costPerContract: pnl.costPerContract,
      costPerClosing: pnl.costPerClosing,
      dataHealthScore: Math.max(
        0,
        100 - Math.round((qualityIssues / Math.max(1, active.length)) * 100),
      ),
      pendingApprovals: all.approvals.filter((a) => a.status === 'PENDING').length,
      stages: totals,
      pipeline: (STAGES as readonly string[]).map((stage) => ({ stage, count: totals[stage] })),
      sources,
      monthly: Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - (5 - i));
        const label = d.toISOString().slice(0, 7);
        const entries = all.transactions.filter((t) => String(t.date).startsWith(label));
        const monthPnl = calculatePnl(entries, properties);
        return { month: label, revenue: monthPnl.revenue, expenses: monthPnl.expenses };
      }),
    },
  };
}
