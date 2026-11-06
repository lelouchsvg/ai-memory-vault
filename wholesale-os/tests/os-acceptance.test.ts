import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

let os: typeof import('../src/lib/os-service');
let service: typeof import('../src/lib/service');
let pool: (typeof import('../src/lib/db'))['pool'];
let admin: import('pg').Pool;
let schemaCreated = false;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalProvider = process.env.OS_AI_PROVIDER;
const schema = `os_qa_${randomUUID().replaceAll('-', '')}`;
type OSActor = {
  id: string;
  email: string;
  role: 'OWNER' | 'OPERATOR' | 'VIEWER';
  demoOnly: boolean;
};
const actor: OSActor = {
  id: randomUUID(),
  email: 'os-owner@example.test',
  role: 'OWNER' as const,
  demoOnly: false,
};
const other: OSActor = {
  id: randomUUID(),
  email: 'os-other@example.test',
  role: 'OWNER' as const,
  demoOnly: false,
};
const viewer: OSActor = {
  id: randomUUID(),
  email: 'os-viewer@example.test',
  role: 'VIEWER' as const,
  demoOnly: false,
};
const demo: OSActor = {
  id: randomUUID(),
  email: 'os-demo@example.test',
  role: 'OWNER' as const,
  demoOnly: true,
};
const now = new Date().toISOString().slice(0, 10);
const before = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const after = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const execute = (input: Record<string, any>, user = actor) =>
  os.executeOsAction(user, { mode: 'DEMO', ...input });
const business = (input: Record<string, any>) =>
  service.executeAction(actor, { mode: 'DEMO', ...input });
const save = (entity: string, record: Record<string, any>) =>
  business({ action: 'save', entity, record });

beforeAll(async () => {
  process.env.OS_AI_PROVIDER = 'disabled';
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: originalDatabaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  const url = new URL(originalDatabaseUrl!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  service = await import('../src/lib/service');
  pool = (await import('../src/lib/db')).pool;
  await (await import('../scripts/migrate')).migrate();
  for (const user of [actor, other, viewer, demo])
    await pool.query(
      'INSERT INTO app_users(id,email,password_hash,role,demo_only) VALUES($1,$2,$3,$4,$5)',
      [user.id, user.email, 'unused-test-account-hash', user.role, user.demoOnly],
    );
  os = await import('../src/lib/os-service');
});
afterAll(async () => {
  if (pool) await pool.end();
  if (admin) {
    if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
  process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalProvider === undefined) delete process.env.OS_AI_PROVIDER;
  else process.env.OS_AI_PROVIDER = originalProvider;
});

async function property(suffix: string, sourced = true) {
  const record = await save('properties', {
    address: `${suffix} OS Acceptance Avenue`,
    city: 'Absecon',
    county: 'Atlantic',
    state: 'NJ',
    zip: '08201',
    propertyType: 'SINGLE FAMILY',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    askingPrice: 110000,
    source: 'Fictional isolated OS acceptance fixture',
    leadSource: 'QA',
    ownershipVerified: true,
    ownershipSource: 'Fictional QA ownership evidence',
    ownershipRetrievedAt: now,
    ownershipConfidence: 95,
  });
  if (sourced) {
    for (let i = 0; i < 3; i++)
      await save('comps', {
        propertyId: record.id,
        address: `${suffix} Comparable ${i}`,
        salePrice: 300000 + i * 1000,
        sqft: 1500,
        saleDate: before(30 + i),
        distance: 0.2,
        propertyType: 'SINGLE FAMILY',
        source: 'Fictional QA sale',
      });
    await save('repairs', {
      propertyId: record.id,
      category: 'Kitchen',
      low: 10000,
      expected: 15000,
      high: 20000,
      assumptions: 'Fictional inspection allowance',
    });
  }
  return record;
}

async function finish(enqueued: { runId: string }) {
  await os.processOsRuns('DEMO', 20);
  const state = await os.getOsState(actor, 'DEMO');
  const run = state.runs.find((item: any) => item.id === enqueued.runId);
  expect(run).toBeDefined();
  if (!run) throw new Error(`Expected persisted run ${enqueued.runId}`);
  return { state, run };
}

describe('agentic OS durable command runtime', () => {
  it('persists an idempotent command, executes a real brief, and records the transcript and events', async () => {
    const session = await execute({ action: 'createSession', title: 'QA morning operations' });
    const input = {
      action: 'chat',
      sessionId: session.id,
      message: 'morning brief',
      idempotencyKey: randomUUID(),
    };
    const enqueued = await execute(input);
    const replayed = await execute(input);
    expect(enqueued.status).toBe('QUEUED');
    expect(replayed.runId).toBe(enqueued.runId);
    await expect(execute({ ...input, message: 'pipeline report' })).rejects.toThrow(
      /idempotency|different|reuse/i,
    );
    const { state, run } = await finish(enqueued);
    expect(run.status).toBe('COMPLETED');
    expect(
      state.messages
        .filter((item: any) => item.sessionId === enqueued.sessionId)
        .some((item: any) => String(item.role).toUpperCase() === 'ASSISTANT' && item.content),
    ).toBe(true);
    expect(state.events.some((item: any) => item.runId === enqueued.runId)).toBe(true);
    expect(
      (await os.getOsState(other, 'DEMO')).sessions.some(
        (item: any) => item.id === enqueued.sessionId,
      ),
    ).toBe(false);
    await expect(
      execute({ action: 'chat', sessionId: enqueued.sessionId, message: 'morning brief' }, other),
    ).rejects.toThrow(/not found|own|access|session/i);
  });

  it('runs underwriting and buyer matching through the canonical business services', async () => {
    const subject = await property('Sourced');
    const enqueued = await execute({
      action: 'chat',
      message: `underwrite ${subject.dealId}`,
      idempotencyKey: randomUUID(),
    });
    const { run } = await finish(enqueued);
    expect(run.status).toBe('COMPLETED');
    let state = await service.getState('DEMO');
    const valued = state.properties.find((item: any) => item.id === subject.id);
    expect(valued.arvBase).toBeGreaterThan(300000);
    expect(valued.repairExpected).toBe(17250);
    expect(valued.mao).toBeGreaterThan(100000);
    await save('buyers', {
      name: 'Fictional OS Buyer',
      email: 'os-buyer@example.test',
      counties: ['Atlantic'],
      markets: ['NJ'],
      propertyTypes: ['SINGLE FAMILY'],
      minPrice: 0,
      maxPrice: 500000,
      maxRehab: 100000,
      reliabilityScore: 95,
      proofOfFundsStatus: 'VERIFIED',
      proofOfFundsExpiry: after(90),
    });
    const matched = await execute({
      action: 'runSkill',
      skillId: 'match_buyers',
      propertyId: subject.id,
      idempotencyKey: randomUUID(),
    });
    expect((await finish(matched)).run.status).toBe('COMPLETED');
    state = await service.getState('DEMO');
    expect(
      state.matches.some((item: any) => item.propertyId === subject.id && item.score > 0),
    ).toBe(true);
    expect(
      state.activities.some(
        (item: any) => item.propertyId === subject.id && item.action === 'UNDERWRITING_CALCULATED',
      ),
    ).toBe(true);
  });

  it('prepares an offer for the inbox and refuses conversational approval or contract execution', async () => {
    const subject = await property('Offer');
    await business({ action: 'underwriting', propertyId: subject.id });
    const enqueued = await execute({
      action: 'chat',
      message: `prepare offer $100000 for ${subject.dealId}`,
      idempotencyKey: randomUUID(),
    });
    expect((await finish(enqueued)).run.status).toBe('COMPLETED');
    const state = await service.getState('DEMO');
    expect(
      state.approvals.some(
        (item: any) =>
          item.propertyId === subject.id && item.status === 'PENDING' && item.amount === 100000,
      ),
    ).toBe(true);
    expect(state.properties.find((item: any) => item.id === subject.id).offerApproved).not.toBe(
      true,
    );
    for (const message of [
      'approve all offers',
      `sign a contract for ${subject.dealId}`,
      'run shell rm -rf /',
    ]) {
      const command = await execute({ action: 'chat', message, idempotencyKey: randomUUID() });
      const { run } = await finish(command);
      expect(['BLOCKED', 'FAILED']).toContain(run.status);
    }
    expect(
      (await service.getState('DEMO')).approvals
        .filter((item: any) => item.propertyId === subject.id)
        .every((item: any) => item.status === 'PENDING'),
    ).toBe(true);
  });

  it('blocks unavailable research and ambiguous commands without inventing external results', async () => {
    const subject = await property('Research', false);
    for (const input of [
      { action: 'runSkill', skillId: 'research_property', propertyId: subject.id },
      { action: 'chat', message: 'tell me tomorrow weather forecast' },
      { action: 'runSkill', skillId: 'underwrite' },
    ]) {
      const queued = await execute({ ...input, idempotencyKey: randomUUID() });
      expect(['BLOCKED', 'FAILED']).toContain((await finish(queued)).run.status);
    }
    const unchanged = (await service.getState('DEMO')).properties.find(
      (item: any) => item.id === subject.id,
    );
    expect(unchanged.underwrittenAt).toBeUndefined();
  });

  it('cancels queued work before any underlying mutation and protects another actor runs', async () => {
    const subject = await property('Cancelled');
    const prior = (await service.getState('DEMO')).properties.find(
      (item: any) => item.id === subject.id,
    );
    const queued = await execute({
      action: 'runSkill',
      skillId: 'underwrite',
      propertyId: subject.id,
      idempotencyKey: randomUUID(),
    });
    await expect(execute({ action: 'cancelRun', id: queued.runId }, other)).rejects.toThrow(
      /not found|own|access/i,
    );
    await execute({ action: 'cancelRun', id: queued.runId });
    const { run } = await finish(queued);
    expect(run.status).toBe('CANCELLED');
    const state = await service.getState('DEMO');
    expect(state.properties.find((item: any) => item.id === subject.id).underwrittenAt).toBe(
      prior.underwrittenAt,
    );
    expect(
      state.activities.some(
        (item: any) => item.propertyId === subject.id && item.action === 'UNDERWRITING_CALCULATED',
      ),
    ).toBe(false);
  });

  it('persists memory, enforces author ownership, and isolates demo notes from live mode', async () => {
    const note = await execute({
      action: 'saveMemory',
      title: 'QA buy box',
      content: 'Fictional preference: Atlantic County, moderate rehab.',
      tags: ['strategy', 'qa'],
    });
    expect(
      (await os.getOsState(actor, 'DEMO')).memory.some(
        (item: any) => item.id === note.id && item.content.includes('Atlantic'),
      ),
    ).toBe(true);
    expect(
      (await os.getOsState(actor, 'LIVE')).memory.some((item: any) => item.id === note.id),
    ).toBe(false);
    await expect(
      execute(
        { action: 'saveMemory', id: note.id, title: 'Unauthorized edit', content: 'Changed' },
        other,
      ),
    ).rejects.toThrow(/not found|own|access|author/i);
    await execute({
      action: 'saveMemory',
      id: note.id,
      title: 'QA updated buy box',
      content: 'Fictional preference: 3 bedrooms, inspected repairs.',
    });
    expect(
      (await os.getOsState(actor, 'DEMO')).memory.find((item: any) => item.id === note.id)?.title,
    ).toBe('QA updated buy box');
    await execute({ action: 'deleteMemory', id: note.id });
    expect(
      (await os.getOsState(actor, 'DEMO')).memory.some((item: any) => item.id === note.id),
    ).toBe(false);
  });

  it('recovers an expired worker lease without creating a duplicate offer after a committed tool action', async () => {
    const subject = await property('Crash recovery');
    await business({ action: 'underwriting', propertyId: subject.id });
    const queued = await execute({
      action: 'chat',
      message: `prepare offer $100000 for ${subject.dealId}`,
      idempotencyKey: randomUUID(),
    });
    expect((await finish(queued)).run.status).toBe('COMPLETED');
    // Simulate a worker disappearing after committing the tool but before recording its final reply.
    await pool.query("DELETE FROM os_messages WHERE run_id=$1 AND role='ASSISTANT'", [
      queued.runId,
    ]);
    await pool.query(
      "UPDATE os_runs SET status='RUNNING',result=NULL,completed_at=NULL,lease_token=$1,leased_at=now()-interval '6 minutes',attempts=1 WHERE id=$2",
      [randomUUID(), queued.runId],
    );
    expect((await finish(queued)).run.status).toBe('COMPLETED');
    expect(
      (await service.getState('DEMO')).approvals.filter(
        (item: any) => item.propertyId === subject.id,
      ),
    ).toHaveLength(1);
    expect(
      (await os.getOsState(actor, 'DEMO')).messages.filter(
        (item: any) => item.runId === queued.runId && item.role === 'ASSISTANT',
      ),
    ).toHaveLength(1);
  });

  it('keeps private memory, command prompts and recalled context out of shared business activity', async () => {
    const secretNote = `PRIVATE_OS_NOTE_${randomUUID()}`;
    const secretPrompt = `PRIVATE_OS_PROMPT_${randomUUID()}`;
    await execute({
      action: 'saveMemory',
      title: 'Private context fixture',
      content: secretNote,
      tags: ['qa'],
    });
    const recalled = await execute({
      action: 'chat',
      message: 'recall memory',
      idempotencyKey: randomUUID(),
    });
    const { state } = await finish(recalled);
    expect(
      state.messages.some(
        (message: any) => message.runId === recalled.runId && message.content.includes(secretNote),
      ),
    ).toBe(true);
    await finish(
      await execute({ action: 'chat', message: secretPrompt, idempotencyKey: randomUUID() }),
    );
    const sharedActivity = JSON.stringify((await service.getState('DEMO')).activities);
    expect(sharedActivity).not.toContain(secretNote);
    expect(sharedActivity).not.toContain(secretPrompt);
    const otherState = await os.getOsState(other, 'DEMO');
    expect(JSON.stringify(otherState)).not.toContain(secretNote);
    expect(JSON.stringify(otherState)).not.toContain(secretPrompt);
  });

  it('rechecks current account permissions when a queued command is claimed', async () => {
    const subject = await property('Role changed');
    const prior = (await service.getState('DEMO')).properties.find(
      (item: any) => item.id === subject.id,
    );
    const queued = await execute({
      action: 'runSkill',
      skillId: 'underwrite',
      propertyId: subject.id,
      idempotencyKey: randomUUID(),
    });
    await pool.query("UPDATE app_users SET role='VIEWER' WHERE id=$1", [actor.id]);
    try {
      expect(['BLOCKED', 'FAILED']).toContain((await finish(queued)).run.status);
      const state = await service.getState('DEMO');
      expect(state.properties.find((item: any) => item.id === subject.id).underwrittenAt).toBe(
        prior.underwrittenAt,
      );
      expect(
        state.activities.some(
          (item: any) =>
            item.propertyId === subject.id && item.action === 'UNDERWRITING_CALCULATED',
        ),
      ).toBe(false);
    } finally {
      await pool.query("UPDATE app_users SET role='OWNER' WHERE id=$1", [actor.id]);
    }
  });

  it('enforces demo-only and viewer boundaries before creating work', async () => {
    await expect(os.getOsState(demo, 'LIVE')).rejects.toThrow(/demo|live|permission/i);
    await expect(
      execute({ mode: 'LIVE', action: 'chat', message: 'morning brief' }, demo),
    ).rejects.toThrow(/demo|live|permission/i);
    await expect(
      execute(
        { action: 'saveMemory', title: 'Forbidden', content: 'Viewer cannot alter memory' },
        viewer,
      ),
    ).rejects.toThrow(/read.only|viewer|permission/i);
    await expect(execute({ action: 'runSkill', skillId: 'plan_today' }, viewer)).rejects.toThrow(
      /read.only|viewer|permission/i,
    );
    const subject = await business({
      mode: 'LIVE',
      action: 'save',
      entity: 'properties',
      record: {
        address: 'LIVE isolated QA',
        city: 'Absecon',
        county: 'Atlantic',
        state: 'NJ',
        zip: '08201',
      },
    });
    await expect(
      execute({ action: 'runSkill', skillId: 'underwrite', propertyId: subject.id }),
    ).rejects.toThrow(/not found|mode|property/i);
  });

  it('enforces its per-account queue bound under concurrent submissions', async () => {
    const submitted = await Promise.allSettled(
      Array.from({ length: 21 }, () =>
        execute({ action: 'chat', message: 'morning brief', idempotencyKey: randomUUID() }, other),
      ),
    );
    const queued = submitted.filter(
      (item): item is PromiseFulfilledResult<any> => item.status === 'fulfilled',
    );
    const rejected = submitted.filter(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    expect(queued).toHaveLength(20);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/queue.*full/i);
    for (const item of queued) await execute({ action: 'cancelRun', id: item.value.runId }, other);
    expect(
      (await os.getOsState(other, 'DEMO')).runs.filter((run: any) => run.status === 'QUEUED'),
    ).toHaveLength(0);
  });
});
