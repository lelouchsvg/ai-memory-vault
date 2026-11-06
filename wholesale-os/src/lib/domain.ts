/** Authoritative business rules. Money is accepted in dollars and rounded at service boundaries.
 * Integer cents are used for addition/subtraction; LLM outputs never enter this module as authority. */
export type RecordData = Record<string, any>;
export const STAGES = [
  'NEW LEAD',
  'RESEARCHING',
  'OWNERSHIP VERIFICATION',
  'SELLER OUTREACH',
  'SELLER ENGAGED',
  'SELLER QUALIFIED',
  'UNDERWRITING',
  'OFFER PREPARATION',
  'OFFER READY FOR APPROVAL',
  'OFFER SENT',
  'NEGOTIATION',
  'UNDER CONTRACT',
  'TITLE OPEN',
  'DISPOSITIONS',
  'BUYER MATCHING',
  'BUYER COMMITTED',
  'ASSIGNMENT PREPARATION',
  'CLOSING',
  'CLOSED',
  'FOLLOW-UP',
  'DEAD',
  'LOST',
  'ON HOLD',
] as const;
export type DealStage = (typeof STAGES)[number];
export const CLOSING_STAGES = [
  'NOT STARTED',
  'TITLE OPEN',
  'REVIEW',
  'ISSUE',
  'CLEAR',
  'SCHEDULED',
  'FUNDED',
  'CLOSED',
] as const;
export const TASK_STATUSES = [
  'BACKLOG',
  'READY',
  'IN PROGRESS',
  'BLOCKED',
  'NEEDS APPROVAL',
  'DONE',
  'FAILED',
] as const;
export const DEFAULT_POLICY = {
  minimumAssignmentFee: 15000,
  investorProfitPercent: 18,
  holdingCosts: 8000,
  transactionPercent: 7,
  riskPercent: 3,
  repairContingencyPercent: 15,
  offerDiscountPercent: 5,
  maxCompAgeDays: 365,
  maxCompDistanceMiles: 2,
  minComps: 3,
  followUpDays: { HOT: 1, WARM: 7, NURTURE: 30 },
  notificationThresholdDays: [14, 7, 3, 1],
  buyerWeights: {
    geography: 25,
    propertyType: 10,
    price: 20,
    rehab: 10,
    size: 10,
    funds: 10,
    reliability: 10,
    closeSpeed: 5,
  },
  leadWeights: {
    motivation: 25,
    equity: 20,
    price: 20,
    condition: 15,
    timeline: 10,
    ownership: 10,
  },
};

const finite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (n: number) => Math.round(n * 100);
const sumMoney = (values: number[]) => values.reduce((sum, value) => sum + cents(value), 0) / 100;
const validDate = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalized = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export const normalizeAddress = (p: RecordData) =>
  [p.address ?? p.streetAddress, p.city, p.state, p.zip]
    .map(normalized)
    .join('|')
    .replace(/\s+/g, ' ');
const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : String(value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
const contains = (values: unknown, value: unknown) =>
  list(values).some((v) => normalized(v) === normalized(value));

export interface Comp extends RecordData {
  salePrice: number;
  sqft?: number;
  squareFootage?: number;
  saleDate: string;
  source: string;
}
export function calculateArv(property: RecordData, comps: RecordData[], now = new Date()) {
  const sqft = finite(property.sqft ?? property.squareFootage);
  if (sqft <= 0) throw new Error('Positive property square footage is required to calculate ARV.');
  const included: { comp: RecordData; ppsf: number; weight: number }[] = [];
  const excludedComps: { id: unknown; reason: string }[] = [];
  for (const comp of comps) {
    const age = validDate(comp.saleDate);
    const compSqft = finite(comp.sqft ?? comp.squareFootage);
    const distance = finite(comp.distance ?? comp.distanceMiles, Infinity);
    const ageDays = age ? (now.getTime() - age.getTime()) / 86_400_000 : Infinity;
    let reason = '';
    if (comp.excluded) reason = String(comp.exclusionReason || 'Excluded by reviewer');
    else if (!comp.source || !age) reason = 'Sale source and valid date required';
    else if (
      ageDays < 0 ||
      ageDays > finite(property.maxCompAgeDays, DEFAULT_POLICY.maxCompAgeDays)
    )
      reason = 'Sale outside permitted date window';
    else if (distance > finite(property.maxCompDistanceMiles, DEFAULT_POLICY.maxCompDistanceMiles))
      reason = 'Sale outside permitted distance';
    else if (compSqft <= 0 || finite(comp.salePrice) <= 0) reason = 'Invalid sale price or area';
    else if (compSqft / sqft < 0.5 || compSqft / sqft > 1.5)
      reason = 'Area differs by more than 50%';
    else if (
      property.propertyType &&
      comp.propertyType &&
      normalized(property.propertyType) !== normalized(comp.propertyType)
    )
      reason = 'Different property type';
    if (reason) {
      excludedComps.push({ id: comp.id, reason });
      continue;
    }
    const weight = 1 / (1 + distance + ageDays / 180);
    included.push({ comp, ppsf: finite(comp.salePrice) / compSqft, weight });
  }
  if (!included.length)
    throw new Error('No eligible comparable sales. Add sourced, recent, nearby sales.');
  const weightedPpsf =
    included.reduce((sum, c) => sum + c.ppsf * c.weight, 0) /
    included.reduce((sum, c) => sum + c.weight, 0);
  const values = included.map((c) => c.ppsf * sqft).sort((a, b) => a - b);
  const arvBase = money(weightedPpsf * sqft);
  const spread = values.length > 1 ? (values.at(-1)! - values[0]) / arvBase : 0.2;
  const uncertainty = clamp(
    Math.max(0.05, spread / 2, included.length < 3 ? 0.12 : 0.05),
    0.05,
    0.35,
  );
  const confidence = clamp(
    Math.round(35 + Math.min(included.length, 5) * 10 - spread * 60 - excludedComps.length * 2),
    10,
    95,
  );
  return {
    arvLow: money(arvBase * (1 - uncertainty)),
    arvBase,
    arvHigh: money(arvBase * (1 + uncertainty)),
    arvConfidence: confidence,
    eligibleComps: included.map((c) => c.comp.id),
    excludedComps,
    reasons: [
      `${included.length} eligible sourced sale(s); distance and recency weighted price per square foot.`,
      'ARV is an estimate, not an appraisal.',
      ...(included.length < 3 ? ['Fewer than three eligible sales: low confidence.'] : []),
    ],
  };
}

export function calculateRepairs(items: RecordData[], contingencyPercent = 15) {
  if (contingencyPercent < 0 || contingencyPercent > 100)
    throw new Error('Repair contingency must be between 0 and 100%.');
  const totals = { low: 0, expected: 0, high: 0 };
  const assumptions: string[] = [];
  for (const item of items) {
    const quantity = finite(item.quantity, 1);
    const low = finite(item.low ?? item.lowCost ?? item.amount);
    const expected = finite(item.expected ?? item.expectedCost ?? item.amount, low);
    const high = finite(item.high ?? item.highCost ?? item.amount, expected);
    if (quantity < 0 || low < 0 || expected < low || high < expected)
      throw new Error('Repair ranges must satisfy 0 ≤ low ≤ expected ≤ high.');
    totals.low += cents(low * quantity);
    totals.expected += cents(expected * quantity);
    totals.high += cents(high * quantity);
    assumptions.push(
      `${item.category ?? item.description ?? 'Repair'}: ${quantity} × $${low} / $${expected} / $${high}${item.assumptions ? `; ${item.assumptions}` : ''}`,
    );
  }
  const factor = 1 + contingencyPercent / 100;
  return {
    repairLow: money((totals.low / 100) * factor),
    repairExpected: money((totals.expected / 100) * factor),
    repairHigh: money((totals.high / 100) * factor),
    assumptions: [
      ...assumptions,
      `${contingencyPercent}% contingency; estimates require inspection.`,
    ],
  };
}

export function underwrite(property: RecordData, inputPolicy: RecordData = {}) {
  const policy = { ...DEFAULT_POLICY, ...inputPolicy };
  for (const field of [
    'arvBase',
    'arv',
    'repairExpected',
    'repairs',
    'arvLow',
    'arvHigh',
    'repairLow',
    'repairHigh',
    'contractPrice',
    'targetAssignmentPrice',
  ]) {
    if (
      property[field] !== undefined &&
      property[field] !== null &&
      (!Number.isFinite(Number(property[field])) || Number(property[field]) < 0)
    )
      throw new Error(`${field} must be a finite nonnegative number.`);
  }
  const arv = finite(property.arvBase ?? property.arv);
  const repairs = finite(property.repairExpected ?? property.repairs);
  if (arv <= 0 || repairs < 0)
    throw new Error('Positive ARV and nonnegative repairs are required.');
  const profitPercent = finite(
    inputPolicy.investorProfitPercent ?? inputPolicy.targetInvestorMargin,
    DEFAULT_POLICY.investorProfitPercent,
  );
  const transactionPercent = finite(policy.transactionPercent, 7);
  const riskPercent = finite(policy.riskPercent, 3);
  if ([profitPercent, transactionPercent, riskPercent].some((v) => v < 0 || v > 100))
    throw new Error('Underwriting percentage assumptions must be between 0 and 100.');
  const holdingCosts = finite(policy.holdingCosts, 8000);
  const assignmentTarget = finite(
    inputPolicy.minimumAssignmentFee ?? inputPolicy.assignmentFee,
    DEFAULT_POLICY.minimumAssignmentFee,
  );
  if (holdingCosts < 0 || assignmentTarget < 0)
    throw new Error('Holding costs and assignment target cannot be negative.');
  const calculate = (scenario: string, value: number, repair: number) => {
    const investorProfit = money((value * profitPercent) / 100);
    const transactionCosts = money(
      inputPolicy.transactionCosts == null
        ? (value * transactionPercent) / 100
        : finite(inputPolicy.transactionCosts),
    );
    const riskAllowance = money(
      inputPolicy.riskAllowance == null
        ? (value * riskPercent) / 100
        : finite(inputPolicy.riskAllowance),
    );
    if (transactionCosts < 0 || riskAllowance < 0)
      throw new Error('Transaction costs and risk allowance cannot be negative.');
    const investorMax = sumMoney([
      value,
      -repair,
      -investorProfit,
      -holdingCosts,
      -transactionCosts,
      -riskAllowance,
    ]);
    const mao = sumMoney([investorMax, -assignmentTarget]);
    return {
      scenario,
      arv: money(value),
      repairs: money(repair),
      investorProfit,
      holdingCosts,
      transactionCosts,
      riskAllowance,
      investorMax,
      mao,
      assignmentTarget,
      viable: mao > 0,
    };
  };
  const base = calculate('BASE', arv, repairs);
  const conservative = calculate(
    'CONSERVATIVE',
    finite(property.arvLow, arv * 0.9),
    finite(property.repairHigh, repairs * 1.2),
  );
  const upside = calculate(
    'UPSIDE',
    finite(property.arvHigh, arv * 1.1),
    finite(property.repairLow, repairs * 0.9),
  );
  const contract = finite(property.contractPrice ?? property.actualOffer, Math.max(0, base.mao));
  const assignmentPrice = finite(property.targetAssignmentPrice, base.investorMax);
  const projectedAssignmentFee = sumMoney([assignmentPrice, -contract]);
  const breakevenDenominator =
    1 -
    ((inputPolicy.transactionCosts == null ? transactionPercent : 0) +
      (inputPolicy.riskAllowance == null ? riskPercent : 0)) /
      100;
  const breakEvenArv =
    breakevenDenominator > 0
      ? money(
          (contract +
            assignmentTarget +
            repairs +
            holdingCosts +
            (inputPolicy.transactionCosts == null ? 0 : finite(inputPolicy.transactionCosts)) +
            (inputPolicy.riskAllowance == null ? 0 : finite(inputPolicy.riskAllowance))) /
            breakevenDenominator,
        )
      : null;
  return {
    investorMax: base.investorMax,
    mao: base.mao,
    maximumAllowableOffer: base.mao,
    recommendedOffer: money(
      Math.max(0, base.mao) * (1 - finite(policy.offerDiscountPercent, 5) / 100),
    ),
    projectedAssignmentFee,
    assignmentTarget,
    breakEvenArv,
    scenarios: [
      base,
      conservative,
      upside,
      { ...base, scenario: 'BREAK-EVEN', arv: breakEvenArv, investorProfit: 0 },
    ],
    assumptions: {
      investorProfitPercent: profitPercent,
      holdingCosts,
      transactionPercent,
      riskPercent,
      transactionCosts: inputPolicy.transactionCosts ?? null,
      riskAllowance: inputPolicy.riskAllowance ?? null,
      minimumAssignmentFee: assignmentTarget,
      estimated: true,
    },
  };
}

export function scoreLead(property: RecordData, weights: RecordData = DEFAULT_POLICY.leadWeights) {
  const motivation = clamp(finite(property.motivationScore, property.sellerMotivation ? 70 : 30));
  const equity = clamp(finite(property.equityPercent, 40));
  const ask = finite(property.askingPrice ?? property.sellerAskingPrice);
  const arv = finite(property.arvBase);
  const price = ask > 0 && arv > 0 ? clamp((1 - ask / arv) * 150) : 40;
  const condition = /poor|distress|heavy|vacant/i.test(
    String(property.condition ?? property.occupancy ?? ''),
  )
    ? 85
    : 45;
  const timeline = finite(property.timelineDays, 90) <= 30 ? 90 : 45;
  const ownership = clamp(finite(property.ownerConfidence ?? property.ownershipConfidence));
  const engagement = clamp(
    finite(
      property.engagementScore,
      ['SELLER ENGAGED', 'SELLER QUALIFIED', 'NEGOTIATION'].includes(property.stage)
        ? 85
        : property.sellerId
          ? 50
          : 10,
    ),
  );
  const signals: RecordData = {
    motivation,
    equity,
    price,
    condition,
    timeline,
    ownership,
    engagement,
  };
  const total = Object.keys(signals).reduce(
    (sum, key) => sum + Math.max(0, finite(weights[key])),
    0,
  );
  if (!total) throw new Error('At least one positive lead weight is required.');
  return Math.round(
    Object.keys(signals).reduce(
      (sum, key) => sum + signals[key] * Math.max(0, finite(weights[key])),
      0,
    ) / total,
  );
}

export function estimateProbability(property: RecordData) {
  if (property.stage === 'CLOSED') return 100;
  if (['DEAD', 'LOST'].includes(property.stage)) return 0;
  const stage = STAGES.indexOf(property.stage);
  const stageBase = stage >= 0 && stage <= 18 ? 10 + stage * 3.6 : 15;
  const owner = clamp(finite(property.ownerConfidence ?? property.ownershipConfidence)) / 100;
  const arv = clamp(finite(property.arvConfidence)) / 100;
  const title = ['CLEAR', 'FUNDED', 'CLOSED'].includes(property.titleStatus)
    ? 10
    : property.titleStatus === 'ISSUE'
      ? -20
      : 0;
  const risk = property.riskGrade === 'RED' ? -25 : property.riskGrade === 'YELLOW' ? -10 : 0;
  return Math.round(
    clamp(stageBase + owner * 8 + arv * 8 + title + risk + (property.buyerId ? 7 : 0), 1, 95),
  );
}

export function matchBuyer(
  property: RecordData,
  buyer: RecordData,
  inputWeights: RecordData = DEFAULT_POLICY.buyerWeights,
  now = new Date(),
) {
  const weights: Record<string, unknown> = { ...DEFAULT_POLICY.buyerWeights, ...inputWeights };
  if (buyer.tier === 'BLOCKED' || buyer.status === 'BLOCKED' || buyer.doNotContact)
    return { score: 0, reasons: ['Buyer is blocked or opted out'], eligible: false };
  const price = finite(
    property.targetAssignmentPrice ??
      property.assignmentPrice ??
      property.contractPrice ??
      property.askingPrice,
  );
  const rehab = finite(property.repairExpected);
  const geography =
    contains(buyer.counties, property.county) ||
    contains(buyer.zipCodes ?? buyer.zips, property.zip) ||
    contains(buyer.markets, property.city) ||
    contains(buyer.markets, property.state);
  const type =
    !list(buyer.propertyTypes).length || contains(buyer.propertyTypes, property.propertyType);
  const budget =
    price > 0 &&
    price >= finite(buyer.minPrice) &&
    price <= finite(buyer.maxPrice ?? buyer.maximumPurchasePrice, Infinity);
  const repairs = rehab <= finite(buyer.maxRehab ?? buyer.maximumRehabTolerance, Infinity);
  const size =
    finite(property.bedrooms) >= finite(buyer.minBedrooms) &&
    finite(property.sqft ?? property.squareFootage) >= finite(buyer.minSqft);
  const expires = validDate(
    buyer.proofOfFundsExpiration ?? buyer.proofOfFundsExpiry ?? buyer.pofExpiresAt,
  );
  const funds =
    ['VERIFIED', 'VALID'].includes(
      String(buyer.proofOfFundsStatus ?? buyer.pofStatus).toUpperCase(),
    ) &&
    !!expires &&
    expires > now;
  const reliability = clamp(finite(buyer.reliabilityScore, 50)) / 100;
  const closing =
    finite(buyer.closeSpeedDays ?? buyer.closeDays, 30) <= finite(property.daysToClose, 30);
  const signals: RecordData = {
    geography: +geography,
    propertyType: +type,
    price: +budget,
    rehab: +repairs,
    size: +size,
    funds: +funds,
    reliability,
    closeSpeed: +closing,
  };
  const total = Object.keys(signals).reduce(
    (sum, key) => sum + Math.max(0, finite(weights[key])),
    0,
  );
  if (!total) throw new Error('At least one positive buyer weight is required.');
  const score = Math.round(
    (Object.keys(signals).reduce(
      (sum, key) => sum + signals[key] * Math.max(0, finite(weights[key])),
      0,
    ) /
      total) *
      100,
  );
  const reasons = [
    geography
      ? `Targets ${property.county ?? property.city ?? property.state}`
      : 'Outside recorded target geography',
    type ? 'Property type compatible' : 'Property type outside preferences',
    budget ? 'Price within budget' : 'Price outside budget',
    repairs ? 'Rehab within tolerance' : 'Rehab exceeds tolerance',
    size ? 'Size criteria met' : 'Size below minimum',
    funds ? 'Verified, current proof of funds' : 'Current verified proof of funds required',
    `${Math.round(reliability * 100)}/100 reliability`,
    closing ? 'Closing timeline compatible' : 'Closing timeline too short',
  ];
  return { score, reasons, eligible: geography && type && budget && repairs && size && funds };
}

export function buyerReliability(events: RecordData[], weights: RecordData = {}) {
  const points = {
    'SUCCESSFUL CLOSING': 10,
    'FAST COMMUNICATION': 2,
    'VERIFIED FUNDS': 5,
    'UNEXPLAINED CANCELLATION': -20,
    'LATE RENEGOTIATION': -10,
    ...weights,
  };
  return clamp(
    50 + events.reduce((sum, event) => sum + finite((points as RecordData)[event.type]), 0),
  );
}

export function redTeam(property: RecordData, comps: RecordData[] = [], now = new Date()) {
  const reasons: string[] = [];
  const mitigations: string[] = [];
  let hard = false;
  const flag = (reason: string, mitigation: string, severe = false) => {
    reasons.push(reason);
    mitigations.push(mitigation);
    hard ||= severe;
  };
  if (
    !property.ownerVerified &&
    !property.ownershipVerified &&
    property.ownershipStatus !== 'VERIFIED'
  )
    flag(
      'Ownership has not been verified',
      'Verify ownership against a sourced deed or tax record.',
      true,
    );
  if (finite(property.arvConfidence) < 60)
    flag('ARV confidence below 60%', 'Add recent, similar, sourced comparable sales.');
  if (comps.length && comps.filter((c) => !c.excluded).length < 3)
    flag('Fewer than three comparable sales', 'Obtain at least three eligible sales.');
  if (!finite(property.arvBase))
    flag('ARV missing', 'Calculate ARV before preparing an offer.', true);
  if (!finite(property.repairExpected))
    flag('Repair estimate missing or zero', 'Add itemized estimates and inspection assumptions.');
  if (property.titleStatus === 'ISSUE' || property.titleIssue)
    flag('Unresolved title issue', 'Escalate to title company or attorney.', true);
  if (property.riskFlags?.length)
    flag('Recorded risk flags require review', String(property.riskFlags.join('; ')), true);
  const ask = finite(property.askingPrice ?? property.sellerAskingPrice);
  const mao = finite(property.mao ?? property.maximumAllowableOffer);
  if (ask && mao && ask > mao * 1.15)
    flag(
      'Seller expectation exceeds underwriting limit',
      'Negotiate within the approved limit or record an explicit override.',
    );
  if (finite(property.projectedAssignmentFee) < finite(property.minimumAssignmentFee, 15000))
    flag('Assignment spread below target', 'Rework price or reject the opportunity.');
  const date = validDate(property.underwrittenAt ?? property.updatedAt);
  if (date && now.getTime() - date.getTime() > 30 * 86_400_000)
    flag('Underwriting assumptions are over 30 days old', 'Refresh comps and assumptions.');
  if (finite(property.daysToClose, 30) < 7)
    flag('Closing timeline shorter than seven days', 'Confirm title and buyer readiness.');
  if (finite(property.buyerDemand, 2) < 2)
    flag('Buyer demand is concentrated', 'Verify demand from multiple qualified buyers.');
  return { grade: hard ? 'RED' : reasons.length ? 'YELLOW' : 'GREEN', reasons, mitigations };
}

export function validateTransition(property: RecordData, to: string, context: RecordData = {}) {
  const blockers: string[] = [];
  if (!(STAGES as readonly string[]).includes(to)) return ['Unknown pipeline stage.'];
  if (property.stage === 'CLOSED' && to !== 'CLOSED')
    return ['Closed deals cannot be reopened through normal pipeline updates.'];
  if (to === property.stage) return blockers;
  const ownerApproved =
    context.ownerApproved === true ||
    context.contractApproved === true ||
    property.contractApproved === true;
  const signed =
    property.signedDocumentStatus === 'SIGNED' ||
    property.signedDocument === true ||
    context.signedDocumentStatus === 'SIGNED';
  const deadlines = context.deadlines ?? property.deadlines;
  const hasDeadlines = Array.isArray(deadlines)
    ? deadlines.length > 0 &&
      deadlines.every((d: RecordData) => !!validDate(d.dueAt ?? d.dueDate ?? d.date))
    : !!property.closingDate && !!property.inspectionDeadline;
  const contractStages = [
    'UNDER CONTRACT',
    'TITLE OPEN',
    'DISPOSITIONS',
    'BUYER MATCHING',
    'BUYER COMMITTED',
    'ASSIGNMENT PREPARATION',
    'CLOSING',
    'CLOSED',
  ];
  if (contractStages.includes(to)) {
    if (finite(property.contractPrice) <= 0)
      blockers.push('A positive contract price is required.');
    if (!validDate(property.executionDate ?? property.contractDate))
      blockers.push('A valid contract execution date is required.');
    if (!hasDeadlines) blockers.push('Contract deadlines must be recorded.');
    if (!signed) blockers.push('A signed purchase agreement must be recorded.');
    if (!ownerApproved) blockers.push('Owner contract approval is required.');
  }
  if (['OFFER READY FOR APPROVAL', 'OFFER SENT'].includes(to)) {
    if (
      !property.ownerVerified &&
      !property.ownershipVerified &&
      property.ownershipStatus !== 'VERIFIED'
    )
      blockers.push('Verified ownership is required.');
    if (finite(property.mao ?? property.maximumAllowableOffer) <= 0)
      blockers.push('A completed underwriting calculation is required.');
    if (!property.riskGrade || property.riskGrade === 'RED')
      blockers.push('Red Team review must pass or be explicitly resolved.');
  }
  if (to === 'OFFER SENT') {
    if (context.offerApproved !== true && property.offerApproved !== true)
      blockers.push('Owner offer approval is required.');
    if (
      finite(property.actualOffer ?? property.recommendedOffer) >
        finite(property.mao ?? property.maximumAllowableOffer) &&
      context.maoOverride !== true &&
      property.maoOverride !== true
    )
      blockers.push('Offer exceeds MAO: explicit owner override required.');
    if (property.doNotContact || context.doNotContact || property.optedOut || context.optedOut)
      blockers.push('Contact is suppressed by do-not-contact or opt-out.');
    if (property.mode === 'LIVE' || context.mode === 'LIVE')
      blockers.push(...validateExternalExecution(property, context));
  }
  if (
    ['BUYER COMMITTED', 'ASSIGNMENT PREPARATION', 'CLOSING', 'CLOSED'].includes(to) &&
    !(property.buyerId || context.buyerId)
  )
    blockers.push('A selected buyer is required.');
  if (
    ['CLOSING', 'CLOSED'].includes(to) &&
    !['CLEAR', 'SCHEDULED', 'FUNDED', 'CLOSED'].includes(property.titleStatus)
  )
    blockers.push('Title must be clear before closing.');
  if (to === 'CLOSED') {
    if (!validDate(property.closingDate)) blockers.push('Closing date is required.');
    if (property.fundingStatus !== 'FUNDED' && context.fundingStatus !== 'FUNDED')
      blockers.push('Verified funding status must be FUNDED.');
    if (context.closingApproved !== true && property.closingApproved !== true)
      blockers.push('Owner closing approval is required.');
  }
  return [...new Set(blockers)];
}

export function validateExternalExecution(property: RecordData, context: RecordData = {}) {
  const blockers: string[] = [];
  if (context.jurisdictionReviewed !== true)
    blockers.push('LEGAL REVIEW REQUIRED: jurisdiction rules not reviewed.');
  if (context.disclosuresVerified !== true)
    blockers.push('Required disclosures have not been verified.');
  if (context.templateAttorneyApproved !== true || !context.templateVersion)
    blockers.push('An attorney-approved, versioned template is required.');
  if (context.assignmentPermitted !== true)
    blockers.push('Assignment restrictions have not been cleared.');
  if (context.contactPermitted !== true || property.doNotContact || property.optedOut)
    blockers.push('Contact permission is missing or suppressed.');
  if (context.ownerApproved !== true && context.offerApproved !== true)
    blockers.push('Owner action approval is required.');
  return blockers;
}

export function calculatePnl(
  entries: RecordData[],
  properties: RecordData[] = [],
  period = 'ALL TIME',
  now = new Date(),
) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let end: Date | null = null;
  if (period === 'LAST MONTH') {
    end = new Date(start);
    start.setUTCMonth(start.getUTCMonth() - 1);
  } else if (period === 'QUARTER') start.setUTCMonth(Math.floor(now.getUTCMonth() / 3) * 3);
  else if (['YEAR TO DATE', 'YTD'].includes(period)) start.setUTCMonth(0);
  const filtered = entries.filter((entry) => {
    if (entry.status === 'VOID' || entry.status === 'PENDING') return false;
    if (
      ['EARNEST MONEY', 'DEPOSIT', 'TRANSFER'].includes(String(entry.category).toUpperCase()) &&
      !entry.forfeited
    )
      return false;
    if (period === 'ALL TIME') return true;
    const date = validDate(entry.date ?? entry.occurredAt ?? entry.createdAt);
    return !!date && date >= start && (!end || date < end) && date <= now;
  });
  const revenueEntries = filtered.filter((e) =>
    ['REVENUE', 'INCOME'].includes(String(e.type ?? e.kind).toUpperCase()),
  );
  const expenseEntries = filtered.filter((e) =>
    ['EXPENSE', 'COST'].includes(String(e.type ?? e.kind).toUpperCase()),
  );
  if (filtered.some((e) => finite(e.amount) < 0))
    throw new Error('Ledger amounts must be nonnegative; direction is specified by entry type.');
  const revenue = sumMoney(revenueEntries.map((e) => finite(e.amount)));
  const assignmentFees = sumMoney(
    revenueEntries
      .filter((e) => /assignment/i.test(String(e.category)))
      .map((e) => finite(e.amount)),
  );
  const dealExpenses = sumMoney(
    expenseEntries.filter((e) => e.propertyId || e.dealId).map((e) => finite(e.amount)),
  );
  const operatingExpenses = sumMoney(
    expenseEntries.filter((e) => !e.propertyId && !e.dealId).map((e) => finite(e.amount)),
  );
  const expenses = sumMoney([dealExpenses, operatingExpenses]);
  const closed = properties.filter((p) => p.stage === 'CLOSED');
  const active = properties.filter((p) => !['CLOSED', 'DEAD', 'LOST'].includes(p.stage));
  const contracts = properties.filter((p) => finite(p.contractPrice) > 0);
  const projectedRevenue = sumMoney(
    active.map((p) => Math.max(0, finite(p.projectedAssignmentFee))),
  );
  const weightedPipeline = sumMoney(
    active.map(
      (p) => (Math.max(0, finite(p.projectedAssignmentFee)) * estimateProbability(p)) / 100,
    ),
  );
  const leadCosts = sumMoney(
    expenseEntries
      .filter((e) => /lead|data|advertis|mail|phone/i.test(String(e.category)))
      .map((e) => finite(e.amount)),
  );
  return {
    revenue,
    actualRevenue: revenue,
    assignmentFees,
    grossAssignmentFees: assignmentFees,
    expenses,
    totalExpenses: expenses,
    dealExpenses,
    operatingExpenses,
    netProfit: sumMoney([revenue, -expenses]),
    netDealContribution: sumMoney([revenue, -dealExpenses]),
    projectedRevenue,
    weightedPipeline,
    averageFee: closed.length ? money(assignmentFees / closed.length) : 0,
    costPerLead: properties.length ? money(leadCosts / properties.length) : 0,
    costPerContract: contracts.length ? money(leadCosts / contracts.length) : 0,
    costPerClosing: closed.length ? money(leadCosts / closed.length) : 0,
    leadToContractConversion: properties.length
      ? money((contracts.length / properties.length) * 100)
      : 0,
    contractToCloseConversion: contracts.length
      ? money((closed.length / contracts.length) * 100)
      : 0,
    period,
    entries: filtered.length,
  };
}

export const leadScore = scoreLead;
export const closeProbability = estimateProbability;
export const buyerMatch = matchBuyer;
export const pnl = calculatePnl;

const agentSeeds = [
  [
    'SCOUT',
    'Acquisitions',
    'Validate imported leads, identify duplicates and calculate lead scores.',
    ['properties'],
    ['properties', 'tasks'],
    ['manual_import', 'csv_import', 'lead_score'],
    ['HUNTER', 'FILTER', 'WATCHTOWER'],
  ],
  [
    'NINJA',
    'Ownership intelligence',
    'Organize sourced ownership evidence; never infer verified ownership.',
    ['properties', 'sellers'],
    ['ownership', 'tasks'],
    ['public_records_provider', 'evidence_validation'],
    ['OWNER', 'ENTITY', 'VERIFY'],
  ],
  [
    'ATLAS',
    'Market intelligence',
    'Summarize sourced local sales and configured market signals.',
    ['properties', 'comps'],
    ['market_reports', 'tasks'],
    ['property_data_provider', 'market_score'],
    ['COMPASS', 'COMPS', 'TREND'],
  ],
  [
    'COMPS',
    'Market intelligence',
    'Validate comparable sales and compute sourced ARV ranges.',
    ['properties', 'comps'],
    ['underwriting', 'tasks'],
    ['calculate_arv'],
    [],
  ],
  [
    'REHAB',
    'Underwriting',
    'Calculate itemized repair ranges and uncertainty.',
    ['properties', 'repairs'],
    ['repair_estimates', 'tasks'],
    ['calculate_repairs'],
    [],
  ],
  [
    'NUMBERS',
    'Underwriting',
    'Calculate scenarios, investor limits, MAO and projected fees.',
    ['properties', 'comps', 'repairs', 'settings'],
    ['underwriting', 'tasks'],
    ['underwrite', 'calculate_arv', 'calculate_repairs'],
    ['REHAB', 'MAO', 'RED TEAM'],
  ],
  [
    'RED TEAM',
    'Quality control',
    'Challenge economics, title, ownership and stale assumptions.',
    ['properties', 'comps', 'underwriting'],
    ['risk_reviews', 'tasks'],
    ['red_team'],
    [],
  ],
  [
    'CLOSER',
    'Acquisitions',
    'Prepare owner-reviewed offer recommendations and follow-up tasks.',
    ['properties', 'sellers', 'underwriting'],
    ['approvals', 'tasks'],
    ['offer_draft', 'follow_up_scheduler'],
    ['QUALIFIER', 'NEGOTIATOR', 'FOLLOW-UP', 'SELLER EXPERIENCE'],
  ],
  [
    'BRIDGE',
    'Dispositions',
    'Rank compatible buyers deterministically and prepare deal summaries.',
    ['properties', 'buyers', 'underwriting'],
    ['buyer_matches', 'tasks', 'approvals'],
    ['buyer_matching', 'deal_summary'],
    ['BUYER SCOUT', 'BUYER DNA', 'MATCHMAKER', 'RELATIONSHIP MANAGER', 'BUYER PERFORMANCE'],
  ],
  [
    'GUARD',
    'Compliance',
    'Check approved template metadata and flag legal review requirements.',
    ['properties', 'documents', 'compliance'],
    ['tasks', 'approvals'],
    ['template_validation', 'compliance_check'],
    ['CONTRACT OPS'],
  ],
  [
    'ESCROW',
    'Closing',
    'Track title status, evidence and deadlines; never move money.',
    ['properties', 'closings', 'deadlines', 'documents'],
    ['tasks', 'notifications'],
    ['deadline_monitor'],
    ['TITLE WATCH', 'DEADLINE', 'CLOSING COORDINATOR'],
  ],
  [
    'LEDGER',
    'Finance',
    'Reconcile recorded ledger entries and calculate realized and projected finance.',
    ['properties', 'ledger'],
    ['reports', 'tasks'],
    ['calculate_pnl'],
    ['FORECAST', 'CAC'],
  ],
  [
    'OPS',
    'Operations',
    'Detect stale records, missing data, overdue work and failed jobs.',
    ['properties', 'buyers', 'sellers', 'tasks', 'jobs'],
    ['tasks', 'notifications'],
    ['data_quality'],
    [],
  ],
  [
    'INSPECTOR',
    'Quality control',
    'Audit data provenance, consistency, proof of funds and deadlines.',
    ['properties', 'buyers', 'comps', 'documents', 'underwriting'],
    ['tasks', 'notifications'],
    ['data_quality', 'underwriting_check'],
    [],
  ],
  [
    'FORGE',
    'Continuous improvement',
    'Generate postmortems and proposed policy changes after terminal outcomes.',
    ['properties', 'ledger', 'activity'],
    ['postmortems', 'approvals', 'tasks'],
    ['postmortem'],
    [],
  ],
  [
    'CONTROL TOWER',
    'Orchestration',
    'Route durable events to bounded jobs; monitor retries and escalate.',
    ['events', 'jobs', 'tasks', 'agents'],
    ['jobs', 'tasks', 'notifications'],
    ['event_router', 'job_scheduler'],
    [],
  ],
] as const;
export const AGENTS = agentSeeds.map(
  ([name, department, mission, reads, writes, tools, subAgents]) => ({
    name,
    department,
    mission,
    subAgents: [...subAgents],
    inputSchema: {
      type: 'object',
      required: ['entityId', 'mode'],
      properties: {
        entityId: { type: 'string' },
        mode: { enum: ['DEMO', 'LIVE'] },
        eventId: { type: 'string' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['status', 'summary', 'evidence'],
      properties: {
        status: { enum: ['COMPLETED', 'BLOCKED', 'FAILED'] },
        summary: { type: 'string' },
        evidence: { type: 'array' },
        recommendations: { type: 'array' },
      },
      additionalProperties: false,
    },
    readAccess: [...reads],
    writeAccess: [...writes],
    toolsAllowed: [...tools],
    actionsAllowed: [
      'Read mode-scoped records',
      'Run the listed deterministic tools',
      'Write only listed result collections',
      'Create correction or escalation tasks',
    ],
    actionsProhibited: [
      'Sign or execute contracts',
      'Move funds',
      'Impersonate owner',
      'Change approved legal language',
      'Bypass owner approvals',
      'Change underwriting policy',
      'Access another mode or unauthorized data',
      'Send external communication without configured provider and approval',
    ],
    approvalRequirements: [
      'External offers, messages and marketing',
      'Transactional documents for external execution',
      'Material economic or policy changes',
    ],
    retryPolicy: { maxAttempts: 3, backoffSeconds: [30, 120, 600], idempotencyRequired: true },
    failurePolicy:
      'Persist structured error, retain inputs and evidence, create a correction task; never fabricate success.',
    escalationRules: [
      'Missing source or credential → BLOCKED',
      'Legal uncertainty or high risk → owner review',
      'Third failure → owner notification',
    ],
  }),
);
