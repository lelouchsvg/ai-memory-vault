import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

let service: typeof import('../src/lib/service');
let pool: (typeof import('../src/lib/db'))['pool'];
let admin: import('pg').Pool;
const schema = `qa_${randomUUID().replaceAll('-', '')}`;
const owner = { id: randomUUID(), email: 'qa-owner@example.test', role: 'OWNER' };
const operator = { id: randomUUID(), email: 'qa-operator@example.test', role: 'OPERATOR' };
const viewer = { id: randomUUID(), email: 'qa-viewer@example.test', role: 'VIEWER' };
const runId = randomUUID().slice(0, 8);
const today = new Date().toISOString().slice(0, 10);
const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const act = (input: Record<string, any>, actor = owner) =>
  service.executeAction(actor, { mode: 'DEMO', ...input });
const save = (entity: string, record: Record<string, any>, actor = owner) =>
  act({ action: 'save', entity, record }, actor);
function newProperty(suffix: string, patch: Record<string, any> = {}) {
  return {
    address: `${runId}-${suffix} Acceptance Lane`,
    city: 'Absecon',
    county: 'Atlantic',
    state: 'NJ',
    zip: '08201',
    propertyType: 'SINGLE FAMILY',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    askingPrice: 125000,
    source: 'QA fictional manual record',
    leadSource: 'QA acceptance',
    ...patch,
  };
}

async function readyProperty(suffix: string, mode: 'DEMO' | 'LIVE' = 'DEMO') {
  const write = (entity: string, record: Record<string, any>) =>
    act({ mode, action: 'save', entity, record });
  const property = await write(
    'properties',
    newProperty(suffix, {
      ownershipVerified: true,
      ownershipSource: 'Fictional QA deed',
      ownershipRetrievedAt: today,
      ownershipConfidence: 95,
    }),
  );
  const comps = [];
  for (let i = 0; i < 3; i++)
    comps.push(
      await write('comps', {
        propertyId: property.id,
        address: `${runId}-${suffix} Comp ${i}`,
        salePrice: 300000 + i * 1000,
        sqft: 1500,
        saleDate: past(25 + i),
        distance: 0.2,
        source: 'Fictional QA sale',
        propertyType: 'SINGLE FAMILY',
      }),
    );
  await write('repairs', {
    propertyId: property.id,
    category: 'Kitchen',
    low: 10000,
    expected: 15000,
    high: 20000,
  });
  return { property: await act({ mode, action: 'underwriting', propertyId: property.id }), comps };
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  service = await import('../src/lib/service');
  pool = (await import('../src/lib/db')).pool;
  await (await import('../scripts/migrate')).migrate();
});
afterAll(async () => {
  if (pool) await pool.end();
  if (admin) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

describe('PostgreSQL acceptance workflow', () => {
  it('operates a sourced lead through underwriting, approvals, contract, buyer, closing and audited P&L', async () => {
    const before = await service.getState('DEMO');
    const seller = await save('sellers', {
      name: `QA Seller ${runId}`,
      email: `qa-seller-${runId}@example.test`,
      status: 'QUALIFIED',
      consent: true,
      contactSource: 'Owner-supplied demo evidence',
    });
    let property = await save('properties', newProperty('flow', { sellerId: seller.id }));
    expect(property.dealId).toMatch(/^NJ-ATL-\d{6,}$/);
    expect(property.stage).toBe('NEW LEAD');
    expect(property.sellerId).toBe(seller.id);
    property = await save('properties', {
      id: property.id,
      ownershipVerified: true,
      ownershipEntity: seller.name,
      ownershipSource: 'Fictional QA deed evidence',
      ownershipRetrievedAt: today,
      ownershipConfidence: 95,
    });

    for (let i = 0; i < 3; i++)
      await save('comps', {
        propertyId: property.id,
        address: `${runId} Comp ${i}`,
        salePrice: 300000 + i * 1500,
        sqft: 1500,
        saleDate: past(20 + i),
        distance: 0.2 + i * 0.1,
        bedrooms: 3,
        bathrooms: 2,
        propertyType: 'SINGLE FAMILY',
        source: 'Fictional QA recorded sale',
      });
    await save('repairs', {
      propertyId: property.id,
      category: 'Kitchen',
      low: 10000,
      expected: 15000,
      high: 20000,
      assumptions: 'Fictional inspection allowance; not an actual inspection',
    });
    property = await act({ action: 'underwriting', propertyId: property.id });
    expect(property.arvBase).toBeGreaterThan(300000);
    expect(property.arvConfidence).toBeGreaterThanOrEqual(60);
    expect(property.repairExpected).toBe(17250);
    expect(property.mao).toBeGreaterThan(0);
    expect(property.mao).toBeLessThan(property.investorMax);
    expect(property.riskGrade).not.toBe('RED');
    expect(property.scenarios).toHaveLength(4);

    const approval = await act({
      action: 'requestOffer',
      propertyId: property.id,
      amount: property.recommendedOffer,
      reason: 'QA acceptance offer based on sourced demo comps',
    });
    expect(approval.status).toBe('PENDING');
    await expect(
      act({ action: 'approval', id: approval.id, decision: 'APPROVED' }, operator),
    ).rejects.toThrow(/owner/i);
    const approved = await act({
      action: 'approval',
      id: approval.id,
      decision: 'APPROVED',
      reason: 'QA owner approves demo simulation',
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.executionStatus).toBe('DEMO SIMULATED');

    await expect(
      act({
        action: 'transition',
        propertyId: property.id,
        stage: 'UNDER CONTRACT',
        reason: 'Missing prerequisites',
      }),
    ).rejects.toThrow();
    const signed = await save('documents', {
      propertyId: property.id,
      name: 'QA signed purchase record',
      type: 'Purchase Agreement',
      status: 'SIGNED',
      source: 'Fictional QA signed evidence',
      signedAt: today,
      content: 'DEMO ONLY: fictional purchase record, no operative legal language.',
    });
    const contractPrice = Math.floor(property.recommendedOffer);
    property = await act({
      action: 'transition',
      propertyId: property.id,
      stage: 'UNDER CONTRACT',
      contractPrice,
      executionDate: today,
      closingDate: future(30),
      inspectionDeadline: future(10),
      signedDocumentId: signed.id,
      ownerApproved: true,
      reason: 'QA owner records fictional executed agreement',
    });
    expect(property.stage).toBe('UNDER CONTRACT');
    expect(property.contractPrice).toBe(contractPrice);
    const afterContract = await service.getState('DEMO');
    expect(
      afterContract.deadlines.filter((d: any) => d.propertyId === property.id).length,
    ).toBeGreaterThanOrEqual(2);

    const buyer = await save('buyers', {
      name: `QA Buyer ${runId}`,
      company: 'QA Fictional Investment Co',
      email: `qa-buyer-${runId}@example.test`,
      counties: ['Atlantic'],
      markets: ['NJ'],
      propertyTypes: ['SINGLE FAMILY'],
      minPrice: 0,
      maxPrice: 500000,
      maxRehab: 100000,
      minBedrooms: 2,
      minSqft: 1000,
      reliabilityScore: 95,
      proofOfFundsStatus: 'VERIFIED',
      proofOfFundsExpiry: future(90),
      closeSpeedDays: 14,
    });
    const matches = await act({ action: 'match', propertyId: property.id });
    const match = matches.find((m: any) => m.buyerId === buyer.id);
    expect(match).toBeDefined();
    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(match.reasons.length).toBeGreaterThan(0);
    property = await act({
      action: 'selectBuyer',
      propertyId: property.id,
      buyerId: buyer.id,
      assignmentPrice: contractPrice + 20000,
      reason: 'Fictional QA buyer commitment',
    });
    expect(property.buyerId ?? property.selectedBuyerId).toBe(buyer.id);
    expect(property.stage).toBe('BUYER COMMITTED');
    await expect(
      act({
        action: 'transition',
        propertyId: property.id,
        stage: 'CLOSING',
        reason: 'Cannot bypass title review',
      }),
    ).rejects.toThrow(/title/i);
    const closingState = await service.getState('DEMO');
    const closing = closingState.closings.find((c: any) => c.propertyId === property.id);
    await save('closings', {
      ...closing,
      propertyId: property.id,
      titleStatus: 'CLEAR',
      titleCompany: 'QA Fictional Title',
      fundingStatus: 'FUNDED',
      closingDate: future(30),
      source: 'Fictional QA title and funding confirmation',
    });
    await save('transactions', {
      propertyId: property.id,
      type: 'EXPENSE',
      category: 'Inspection',
      amount: 500,
      date: today,
      reference: `qa-expense:${runId}`,
    });
    const closed = await act({
      action: 'close',
      propertyId: property.id,
      amount: 20000,
      date: today,
      confirmed: true,
      fundingConfirmed: true,
      reason: `Fictional QA settlement ${runId}`,
    });
    expect(closed.stage ?? closed.property?.stage).toBe('CLOSED');
    for (let i = 0; i < 10; i++) {
      const result = await act({ action: 'runJobs' });
      if (!result.processed) break;
    }
    const final = await service.getState('DEMO');
    const finalProperty = final.properties.find((p: any) => p.id === property.id);
    expect(finalProperty.stage).toBe('CLOSED');
    expect(finalProperty.actualAssignmentFee).toBe(20000);
    expect(
      final.transactions.filter((t: any) => t.propertyId === property.id && t.type === 'REVENUE'),
    ).toHaveLength(1);
    const financial = final.summary.finance ?? final.summary;
    const financialBefore = before.summary.finance ?? before.summary;
    expect(financial.actualRevenue ?? financial.revenue).toBe(
      (financialBefore.actualRevenue ?? financialBefore.revenue) + 20000,
    );
    expect(financial.totalExpenses ?? financial.expenses).toBe(
      (financialBefore.totalExpenses ?? financialBefore.expenses) + 500,
    );
    expect(
      final.activities.some((a: any) => a.propertyId === property.id && /CLOS/i.test(a.action)),
    ).toBe(true);
    expect(
      final.activities.filter((a: any) => a.propertyId === property.id).length,
    ).toBeGreaterThan(12);
    expect(
      final.agentRuns.some(
        (r: any) => r.propertyId === property.id && r.agent === 'FORGE' && r.status === 'COMPLETED',
      ),
    ).toBe(true);
    await expect(
      act({
        action: 'close',
        propertyId: property.id,
        amount: 20000,
        date: today,
        confirmed: true,
      }),
    ).rejects.toThrow(/closed|already/i);
  });

  it('rejects spoofed financial values, duplicate properties and cross-mode entity links', async () => {
    const record = newProperty('isolation');
    const property = await save('properties', record);
    await expect(save('properties', { ...record })).rejects.toThrow();
    const spoofBuyer = await save('buyers', {
      name: `QA Spoof ${runId}`,
      email: `qa-spoof-${runId}@example.test`,
    });
    for (const patch of [
      { mao: 999999 },
      { contractApproved: true },
      { signedDocumentStatus: 'SIGNED' },
      { buyerId: spoofBuyer.id },
      { titleStatus: 'CLEAR' },
      { actualOffer: 1 },
      { underwrittenAt: today },
      { ownerVerified: true },
    ]) {
      await expect(save('properties', { id: property.id, ...patch })).rejects.toThrow(
        /calculated|workflow/i,
      );
    }
    const demoSeller = await save('sellers', {
      name: `QA Isolation ${runId}`,
      email: `qa-isolation-${runId}@example.test`,
    });
    await expect(
      act({
        mode: 'LIVE',
        action: 'save',
        entity: 'properties',
        record: newProperty('live', { sellerId: demoSeller.id }),
      }),
    ).rejects.toThrow(/not found|mode/i);
    const live = await service.getState('LIVE');
    expect(live.properties.some((p: any) => p.id === property.id)).toBe(false);
  });

  it('deduplicates idempotent creates and rejects key reuse with a changed request', async () => {
    const key = `qa-idempotency:${runId}`;
    const input = {
      action: 'save',
      entity: 'tasks',
      record: { title: `QA idempotent ${runId}` },
      idempotencyKey: key,
    };
    const first = await act(input);
    const second = await act(input);
    expect(second.id).toBe(first.id);
    await expect(act({ ...input, record: { title: 'Changed request' } })).rejects.toThrow(
      /idempotency|reused|different/i,
    );
  });

  it('enforces viewer and owner permissions and immutable audit rows', async () => {
    await expect(save('tasks', { title: 'Forbidden viewer action' }, viewer)).rejects.toThrow(
      /permission|read.only|viewer/i,
    );
    await expect(
      save('transactions', { type: 'EXPENSE', category: 'QA', amount: 5, date: today }, operator),
    ).rejects.toThrow(/owner/i);
    const { rows } = await pool.query('SELECT id FROM audit_log WHERE actor=$1 LIMIT 1', [
      owner.email,
    ]);
    expect(rows.length).toBe(1);
    await expect(
      pool.query('UPDATE audit_log SET reason=$1 WHERE id=$2', ['tampering', rows[0].id]),
    ).rejects.toThrow(/immutable/i);
  });

  it('blocks opted-out sellers and ineligible buyer commitments', async () => {
    const seller = await save('sellers', {
      name: `QA DNC ${runId}`,
      email: `qa-dnc-${runId}@example.test`,
      doNotContact: true,
    });
    const property = await save('properties', newProperty('dnc', { sellerId: seller.id }));
    await expect(
      act({ action: 'requestOffer', propertyId: property.id, amount: 100000 }),
    ).rejects.toThrow();
    const buyer = await save('buyers', {
      name: `QA blocked buyer ${runId}`,
      email: `qa-blocked-${runId}@example.test`,
      tier: 'BLOCKED',
    });
    await expect(
      act({
        action: 'selectBuyer',
        propertyId: property.id,
        buyerId: buyer.id,
        assignmentPrice: 150000,
      }),
    ).rejects.toThrow();
  });

  it('blocks direct offer-sent transitions before underwriting and owner approval', async () => {
    const property = await save('properties', newProperty('unsent'));
    await expect(
      act({
        action: 'transition',
        propertyId: property.id,
        stage: 'OFFER SENT',
        reason: 'Attempt approval bypass',
      }),
    ).rejects.toThrow(/underwriting|approval|ownership|review/i);
  });

  it('records paused-agent failures, resumes execution, and deduplicates deadline reminders', async () => {
    const property = await save('properties', newProperty('agent'));
    await act({ action: 'agentStatus', agent: 'SCOUT', status: 'PAUSED' });
    try {
      const failed = await act({ action: 'runAgent', agent: 'SCOUT', propertyId: property.id });
      expect(failed.status).toBe('FAILED');
      expect(failed.error.message).toMatch(/paused/i);
    } finally {
      await act({ action: 'agentStatus', agent: 'SCOUT', status: 'ACTIVE' });
    }
    const completed = await act({ action: 'runAgent', agent: 'SCOUT', propertyId: property.id });
    expect(completed.status).toBe('COMPLETED');
    await save('deadlines', {
      propertyId: property.id,
      type: 'INSPECTION',
      dueDate: future(2),
      status: 'OPEN',
    });
    await act({ action: 'scan' });
    const first = await service.getState('DEMO');
    const firstNotifications = first.notifications.filter((n: any) => n.propertyId === property.id);
    expect(firstNotifications.length).toBeGreaterThan(0);
    await act({ action: 'scan' });
    const second = await service.getState('DEMO');
    expect(second.notifications.filter((n: any) => n.propertyId === property.id)).toHaveLength(
      firstNotifications.length,
    );
  });

  it('rejects stale offer approvals after comparable-sale evidence changes', async () => {
    const { property, comps } = await readyProperty('stale-approval');
    const approval = await act({
      action: 'requestOffer',
      propertyId: property.id,
      amount: property.recommendedOffer,
      reason: 'QA snapshot',
    });
    await save('comps', { id: comps[0].id, salePrice: 200000 });
    await expect(
      act({
        action: 'approval',
        id: approval.id,
        decision: 'APPROVED',
        reason: 'Attempt stale approval',
      }),
    ).rejects.toThrow(/stale|refresh|recalculat|underwrit|changed|invalid/i);
  });

  it('records live approvals without fabricating delivery or external compliance clearance', async () => {
    const { property } = await readyProperty('live-not-configured', 'LIVE');
    const approval = await act({
      mode: 'LIVE',
      action: 'requestOffer',
      propertyId: property.id,
      amount: property.recommendedOffer,
      reason: 'QA live provider gate',
    });
    const decided = await act({
      mode: 'LIVE',
      action: 'approval',
      id: approval.id,
      decision: 'APPROVED',
      reason: 'QA authorizes draft only',
    });
    expect(decided.executionStatus).toBe('NOT CONFIGURED');
    expect(decided.blockers.join(' ')).toMatch(/LEGAL REVIEW REQUIRED/);
    const state = await service.getState('LIVE');
    expect(state.properties.find((p: any) => p.id === property.id).stage).toBe(
      'OFFER READY FOR APPROVAL',
    );
    expect(
      state.tasks.some((t: any) => t.propertyId === property.id && t.status === 'BLOCKED'),
    ).toBe(true);
    expect(
      state.integrations
        .filter((i: any) => /Email|SMS/.test(i.name))
        .every((i: any) => i.status === 'NOT CONFIGURED'),
    ).toBe(true);
  });
});
