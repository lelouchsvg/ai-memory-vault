import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, type DB } from './db';
import { executeAction, getState, ServiceError, type Mode } from './service';
import {
  OS_SKILLS,
  SKILL_IDS,
  planCommand,
  blockedCommandReason,
  type CommandPlan,
  type SkillId,
} from './os-planner';
import { getOsPlannerStatus, resolveOsPlan } from './os-ai';

export type OsActor = { id: string; email: string; role: string; demoOnly?: boolean };
type R = Record<string, any>;
const uuid = z.string().uuid();
const stamp = () => new Date().toISOString();
const date = (value: any) => (value instanceof Date ? value.toISOString() : (value ?? null));
const displayMoney = (value: unknown) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
// The business audit is shared within a workspace. Private memory, commands, and
// transcript results remain exclusively in actor-scoped OS tables.
function auditMetadata(value: unknown): R | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as R;
  const result = v.result && typeof v.result === 'object' ? v.result : {};
  return {
    ...(typeof v.status === 'string' &&
    ['QUEUED', 'RUNNING', 'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'].includes(v.status)
      ? { status: v.status }
      : {}),
    ...((SKILL_IDS as readonly string[]).includes(v.skillId ?? result.skillId)
      ? { skillId: v.skillId ?? result.skillId }
      : {}),
    ...(typeof v.content === 'string' ? { contentLength: v.content.length } : {}),
    ...(typeof v.prompt === 'string' ? { promptLength: v.prompt.length } : {}),
    ...(Array.isArray(v.tags) ? { tagCount: v.tags.length } : {}),
    ...(Array.isArray(result.notes) ? { noteCount: result.notes.length } : {}),
    ...(v.cancelRequested ? { cancelRequested: true } : {}),
  };
}
function authorize(actor: OsActor, rawMode: unknown, write = false): Mode {
  if (!actor?.id || !uuid.safeParse(actor.id).success)
    throw new ServiceError('Authentication required', 401);
  if (!['OWNER', 'OPERATOR', 'VIEWER'].includes(actor.role))
    throw new ServiceError('Invalid role', 403);
  if (rawMode !== 'DEMO' && rawMode !== 'LIVE') throw new ServiceError('Choose DEMO or LIVE');
  if (actor.demoOnly && rawMode === 'LIVE')
    throw new ServiceError('Demo accounts cannot access LIVE agent sessions or memory', 403);
  if (write && actor.role === 'VIEWER')
    throw new ServiceError('Read-only accounts cannot run commands or edit memory', 403);
  return rawMode;
}
function id(value: unknown): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw new ServiceError('Valid record ID required');
  return r.data;
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ServiceError(`${name} must contain 1–${max} characters`);
  return value.trim();
}
async function recordAudit(
  db: DB,
  actor: OsActor,
  mode: Mode,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
  propertyId: string | null = null,
) {
  await db.query(
    'INSERT INTO audit_log(mode,actor,actor_type,action,entity,entity_id,property_id,old_value,new_value,reason,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [
      mode,
      actor.email,
      'USER',
      action,
      entity,
      entityId,
      propertyId,
      JSON.stringify(auditMetadata(oldValue)),
      JSON.stringify(auditMetadata(newValue)),
      'Agentic OS operation',
      'AGENTIC_OS',
    ],
  );
}
async function event(db: DB, run: R, level: 'INFO' | 'WARNING' | 'ERROR', message: string) {
  await db.query(
    'INSERT INTO os_events(mode,actor_id,run_id,level,message) VALUES($1,$2,$3,$4,$5)',
    [run.mode, run.actor_id, run.id, level, message.slice(0, 2000)],
  );
}
function mapRun(row: R) {
  return {
    id: row.id,
    sessionId: row.session_id,
    mode: row.mode,
    skillId: row.skill_id,
    propertyId: row.property_id,
    prompt: row.prompt,
    status: row.status,
    result: row.result,
    error: row.error,
    cancelRequested: row.cancel_requested,
    attempts: row.attempts,
    createdAt: date(row.created_at),
    startedAt: date(row.started_at),
    completedAt: date(row.completed_at),
  };
}
async function ownSession(db: DB, actor: OsActor, mode: Mode, sessionId: unknown) {
  const found = await db.query(
    'SELECT * FROM os_sessions WHERE id=$1 AND actor_id=$2 AND mode=$3',
    [id(sessionId), actor.id, mode],
  );
  if (!found.rowCount) throw new ServiceError('Conversation not found in this workspace', 404);
  return found.rows[0];
}
async function createSession(db: DB, actor: OsActor, mode: Mode, title: string) {
  return (
    await db.query('INSERT INTO os_sessions(actor_id,mode,title) VALUES($1,$2,$3) RETURNING *', [
      actor.id,
      mode,
      title,
    ])
  ).rows[0];
}
export async function getOsState(actor: OsActor, rawMode: unknown) {
  const mode = authorize(actor, rawMode);
  const [sessions, messages, runs, memory, events, heartbeat] = await Promise.all([
    pool.query(
      'SELECT * FROM os_sessions WHERE actor_id=$1 AND mode=$2 ORDER BY updated_at DESC LIMIT 100',
      [actor.id, mode],
    ),
    pool.query(
      'SELECT * FROM (SELECT * FROM os_messages WHERE actor_id=$1 AND mode=$2 ORDER BY created_at DESC LIMIT 1000) m ORDER BY created_at',
      [actor.id, mode],
    ),
    pool.query(
      'SELECT * FROM os_runs WHERE actor_id=$1 AND mode=$2 ORDER BY created_at DESC LIMIT 100',
      [actor.id, mode],
    ),
    pool.query(
      'SELECT m.*,u.email AS author FROM os_memory m JOIN app_users u ON u.id=m.actor_id WHERE m.actor_id=$1 AND m.mode=$2 ORDER BY m.updated_at DESC LIMIT 200',
      [actor.id, mode],
    ),
    pool.query('SELECT * FROM os_events WHERE actor_id=$1 AND mode=$2 ORDER BY id DESC LIMIT 300', [
      actor.id,
      mode,
    ]),
    pool.query('SELECT * FROM os_worker_state WHERE mode=$1', [mode]),
  ]);
  const planner = getOsPlannerStatus();
  const lastSeen = heartbeat.rows[0]?.last_seen_at;
  const worker = {
    state: lastSeen && Date.now() - new Date(lastSeen).getTime() < 15_000 ? 'CONNECTED' : 'OFFLINE',
    lastSeenAt: date(lastSeen),
  };
  const queued = runs.rows.filter((r) => r.status === 'QUEUED').length;
  const running = runs.rows.filter((r) => r.status === 'RUNNING').length;
  return {
    sessions: sessions.rows.map((r) => ({
      id: r.id,
      title: r.title,
      mode: r.mode,
      createdAt: date(r.created_at),
      updatedAt: date(r.updated_at),
    })),
    messages: messages.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      runId: r.run_id,
      role: r.role,
      content: r.content,
      createdAt: date(r.created_at),
    })),
    runs: runs.rows.map(mapRun),
    memory: memory.rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tags: r.tags,
      author: r.author,
      mode: r.mode,
      createdAt: date(r.created_at),
      updatedAt: date(r.updated_at),
    })),
    skills: OS_SKILLS.map((s) => ({
      ...s,
      status: s.id === 'research_property' ? 'NOT CONFIGURED' : 'AVAILABLE',
    })),
    status: {
      state: running ? 'WORKING' : 'IDLE',
      engine: 'LOCAL_SKILLS',
      database: 'CONNECTED',
      planner,
      worker,
      queued,
      running,
      memoryCount: memory.rows.length,
      providerConfigured: planner.configured,
      providerName: planner.label,
      workerLastSeenAt: worker.lastSeenAt,
    },
    events: events.rows.map((r) => ({
      id: String(r.id),
      runId: r.run_id,
      level: r.level,
      message: r.message,
      createdAt: date(r.created_at),
    })),
  };
}

export async function executeOsAction(actor: OsActor, input: R): Promise<any> {
  const mode = authorize(actor, input.mode, true);
  return transaction(async (db) => {
    if (input.action === 'createSession') {
      const session = await createSession(
        db,
        actor,
        mode,
        text(input.title || 'New conversation', 'Title', 160),
      );
      return { id: session.id, sessionId: session.id, title: session.title };
    }
    if (input.action === 'saveMemory') {
      const title = text(input.title, 'Title', 160);
      const content = text(input.content, 'Memory', 20000);
      if (
        !Array.isArray(input.tags ?? []) ||
        (input.tags ?? []).length > 20 ||
        (input.tags ?? []).some((t: unknown) => typeof t !== 'string' || t.length > 40)
      )
        throw new ServiceError('Use at most 20 text tags of up to 40 characters');
      const tags = (input.tags ?? []).map((t: string) => t.trim()).filter(Boolean);
      if (input.id) {
        const old = (
          await db.query(
            'SELECT * FROM os_memory WHERE id=$1 AND actor_id=$2 AND mode=$3 FOR UPDATE',
            [id(input.id), actor.id, mode],
          )
        ).rows[0];
        if (!old) throw new ServiceError('Memory note not found', 404);
        await db.query(
          'UPDATE os_memory SET title=$1,content=$2,tags=$3,updated_at=now() WHERE id=$4',
          [title, content, JSON.stringify(tags), old.id],
        );
        await recordAudit(
          db,
          actor,
          mode,
          'MEMORY_UPDATED',
          'os_memory',
          old.id,
          { title: old.title, content: old.content },
          { title, content, tags },
        );
        return { id: old.id, title, content, tags };
      }
      const saved = (
        await db.query(
          'INSERT INTO os_memory(mode,actor_id,title,content,tags) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [mode, actor.id, title, content, JSON.stringify(tags)],
        )
      ).rows[0];
      await recordAudit(db, actor, mode, 'MEMORY_CREATED', 'os_memory', saved.id, null, {
        title,
        content,
        tags,
      });
      return { ...saved, title, content, tags };
    }
    if (input.action === 'deleteMemory') {
      const old = (
        await db.query(
          'SELECT * FROM os_memory WHERE id=$1 AND actor_id=$2 AND mode=$3 FOR UPDATE',
          [id(input.id), actor.id, mode],
        )
      ).rows[0];
      if (!old) throw new ServiceError('Memory note not found', 404);
      await db.query('DELETE FROM os_memory WHERE id=$1', [old.id]);
      await recordAudit(
        db,
        actor,
        mode,
        'MEMORY_DELETED',
        'os_memory',
        old.id,
        { title: old.title, content: old.content },
        null,
      );
      return { id: old.id, deleted: true };
    }
    if (input.action === 'cancelRun') {
      const run = (
        await db.query('SELECT * FROM os_runs WHERE id=$1 AND actor_id=$2 AND mode=$3 FOR UPDATE', [
          id(input.id),
          actor.id,
          mode,
        ])
      ).rows[0];
      if (!run) throw new ServiceError('Run not found', 404);
      if (!['QUEUED', 'RUNNING'].includes(run.status))
        throw new ServiceError('This run has already finished', 409);
      if (run.status === 'QUEUED') {
        await db.query(
          "UPDATE os_runs SET status='CANCELLED',cancel_requested=true,completed_at=now() WHERE id=$1",
          [run.id],
        );
        await db.query(
          "INSERT INTO os_messages(mode,actor_id,session_id,run_id,role,content) VALUES($1,$2,$3,$4,'ASSISTANT',$5) ON CONFLICT(run_id,role) DO NOTHING",
          [
            mode,
            actor.id,
            run.session_id,
            run.id,
            'Cancelled before execution. No tools were run.',
          ],
        );
        await event(db, run, 'INFO', 'Cancelled while queued. No tools were run.');
      } else {
        await db.query('UPDATE os_runs SET cancel_requested=true WHERE id=$1', [run.id]);
        await event(
          db,
          run,
          'WARNING',
          'Cancellation requested. Execution stops before the next tool; an already committed action cannot be undone.',
        );
      }
      await recordAudit(
        db,
        actor,
        mode,
        'OS_RUN_CANCEL_REQUESTED',
        'os_runs',
        run.id,
        { status: run.status },
        { cancelRequested: true },
        run.property_id,
      );
      return {
        id: run.id,
        status: run.status === 'QUEUED' ? 'CANCELLED' : 'RUNNING',
        cancelRequested: true,
      };
    }
    if (!['chat', 'runSkill'].includes(input.action))
      throw new ServiceError('Unknown agentic OS action');
    const skillId = input.action === 'runSkill' ? String(input.skillId) : null;
    if (skillId && !(SKILL_IDS as readonly string[]).includes(skillId))
      throw new ServiceError('Choose an available skill');
    const prompt =
      input.action === 'chat'
        ? text(input.message, 'Message', 8000)
        : `Run ${OS_SKILLS.find((s) => s.id === skillId)?.name}`;
    const propertyId = input.propertyId ? id(input.propertyId) : null;
    if (
      propertyId &&
      !(await db.query('SELECT id FROM properties WHERE id=$1 AND mode=$2', [propertyId, mode]))
        .rowCount
    )
      throw new ServiceError('Property not found in this workspace', 404);
    const key = input.idempotencyKey ? text(input.idempotencyKey, 'Idempotency key', 200) : null;
    const hash = createHash('sha256')
      .update(JSON.stringify({ prompt, skillId, propertyId, sessionId: input.sessionId ?? null }))
      .digest('hex');
    if (key) {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `os:${mode}:${actor.id}:${key}`,
      ]);
      const prior = (
        await db.query(
          'SELECT * FROM os_runs WHERE mode=$1 AND actor_id=$2 AND idempotency_key=$3',
          [mode, actor.id, key],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash)
          throw new ServiceError('Idempotency key was already used for another command', 409);
        return { sessionId: prior.session_id, runId: prior.id, status: prior.status };
      }
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`os-queue:${mode}:${actor.id}`]);
    const outstanding = await db.query(
      "SELECT count(*) FROM os_runs WHERE actor_id=$1 AND mode=$2 AND status IN ('QUEUED','RUNNING')",
      [actor.id, mode],
    );
    if (Number(outstanding.rows[0].count) >= 20)
      throw new ServiceError(
        'Your run queue is full. Wait for current runs or cancel queued work.',
        429,
      );
    const session = input.sessionId
      ? await ownSession(db, actor, mode, input.sessionId)
      : await createSession(db, actor, mode, prompt.slice(0, 100));
    const run = (
      await db.query(
        'INSERT INTO os_runs(mode,actor_id,session_id,prompt,skill_id,property_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [mode, actor.id, session.id, prompt, skillId, propertyId, key, hash],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO os_messages(mode,actor_id,session_id,run_id,role,content) VALUES($1,$2,$3,$4,'USER',$5)",
      [mode, actor.id, session.id, run.id, prompt],
    );
    await db.query('UPDATE os_sessions SET updated_at=now() WHERE id=$1', [session.id]);
    await event(db, run, 'INFO', `Command queued in ${mode}. Waiting for the background worker.`);
    await recordAudit(
      db,
      actor,
      mode,
      'OS_RUN_QUEUED',
      'os_runs',
      run.id,
      null,
      { skillId, prompt },
      propertyId,
    );
    return { sessionId: session.id, runId: run.id, status: 'QUEUED' };
  });
}

function propertyForPlan(plan: CommandPlan, run: R, state: R): R | null {
  if (plan.propertyQuery) {
    const query = plan.propertyQuery.toLowerCase().trim();
    const exact = state.properties.filter((p: R) =>
      [p.id, p.dealId, p.address].some((v) => String(v ?? '').toLowerCase() === query),
    );
    const matches = exact.length
      ? exact
      : state.properties.filter(
          (p: R) =>
            String(p.address ?? '')
              .toLowerCase()
              .includes(query) ||
            String(p.dealId ?? '')
              .toLowerCase()
              .includes(query),
        );
    if (matches.length !== 1)
      throw new ServiceError(
        matches.length
          ? 'More than one property matches. Select a property before running this skill.'
          : 'No property matches that Deal ID or address. Select a property from this workspace.',
      );
    return matches[0];
  }
  return run.property_id
    ? (state.properties.find((p: R) => p.id === run.property_id) ?? null)
    : null;
}
async function finishRun(
  run: R,
  status: string,
  content: string,
  result: R = {},
  error: R | null = null,
) {
  return transaction(async (db) => {
    const current = (
      await db.query('SELECT * FROM os_runs WHERE id=$1 AND lease_token=$2 FOR UPDATE', [
        run.id,
        run.lease_token,
      ])
    ).rows[0];
    if (!current || current.status !== 'RUNNING') return;
    if (current.cancel_requested && status === 'COMPLETED')
      await event(
        db,
        run,
        'WARNING',
        'Cancellation arrived after the tool began. Its committed result is retained and reported accurately.',
      );
    await db.query(
      'UPDATE os_runs SET status=$1,result=$2,error=$3,completed_at=now(),lease_token=NULL,leased_at=NULL WHERE id=$4',
      [status, JSON.stringify(result), error ? JSON.stringify(error) : null, run.id],
    );
    await db.query(
      "INSERT INTO os_messages(mode,actor_id,session_id,run_id,role,content) VALUES($1,$2,$3,$4,'ASSISTANT',$5) ON CONFLICT(run_id,role) DO NOTHING",
      [run.mode, run.actor_id, run.session_id, run.id, content],
    );
    await db.query('UPDATE os_sessions SET updated_at=now() WHERE id=$1', [run.session_id]);
    await event(
      db,
      run,
      status === 'FAILED' ? 'ERROR' : status === 'BLOCKED' ? 'WARNING' : 'INFO',
      content.slice(0, 1000),
    );
    const actor = (await db.query('SELECT email FROM app_users WHERE id=$1', [run.actor_id]))
      .rows[0];
    await recordAudit(
      db,
      { id: run.actor_id, email: actor?.email ?? 'Deleted user', role: 'SYSTEM' },
      run.mode,
      `OS_RUN_${status}`,
      'os_runs',
      run.id,
      null,
      { status, result, error },
      run.property_id,
    );
  });
}
async function cancelledBeforeTool(run: R) {
  const current = (
    await pool.query('SELECT cancel_requested,status FROM os_runs WHERE id=$1 AND lease_token=$2', [
      run.id,
      run.lease_token,
    ])
  ).rows[0];
  if (!current || current.status !== 'RUNNING') return true;
  if (current.cancel_requested) {
    await finishRun(run, 'CANCELLED', 'Cancelled before tool execution. No tool was run.', {});
    return true;
  }
  return false;
}
async function runOne(run: R) {
  try {
    const user = (
      await pool.query('SELECT id,email,role,demo_only FROM app_users WHERE id=$1', [run.actor_id])
    ).rows[0];
    if (!user) throw new ServiceError('The account that requested this run no longer exists', 403);
    const actor: OsActor = {
      id: user.id,
      email: user.email,
      role: user.role,
      demoOnly: user.demo_only,
    };
    authorize(actor, run.mode, true);
    if (await cancelledBeforeTool(run)) return;
    await event(
      pool,
      run,
      'INFO',
      'Loaded current account permissions and the canonical workspace snapshot.',
    );
    const state = await getState(run.mode);
    let plan: CommandPlan = run.plan;
    if (!plan) {
      const blocked = run.skill_id ? null : blockedCommandReason(run.prompt);
      if (blocked) plan = { skillId: 'blocked', reason: blocked };
      else if (run.skill_id) plan = { skillId: run.skill_id as SkillId };
      else {
        const planner = getOsPlannerStatus();
        if (planner.provider === 'OPENAI' && planner.configured) {
          try {
            plan =
              (await resolveOsPlan(run.prompt, {
                mode: run.mode,
                propertyId: run.property_id ?? undefined,
                properties: state.properties.map((p: R) => ({
                  id: p.id,
                  dealId: p.dealId,
                  address: p.address,
                })),
              })) ?? planCommand(run.prompt);
            await event(
              pool,
              run,
              'INFO',
              `Interpreted command with ${planner.label}. Only allowlisted skills may execute.`,
            );
          } catch (e) {
            await event(
              pool,
              run,
              'WARNING',
              `AI planner unavailable; using explicit local command rules. ${e instanceof Error ? e.message : 'Provider failed'}`,
            );
            plan = planCommand(run.prompt);
          }
        } else {
          plan = planCommand(run.prompt);
          await event(
            pool,
            run,
            'INFO',
            'Interpreted command with local deterministic skill rules. No LLM was used.',
          );
        }
      }
      if (!plan || !['blocked', 'unsupported', ...SKILL_IDS].includes(plan.skillId))
        throw new ServiceError('Planner returned an unsupported skill');
      await pool.query('UPDATE os_runs SET plan=$1,skill_id=$2 WHERE id=$3 AND lease_token=$4', [
        JSON.stringify(plan),
        plan.skillId,
        run.id,
        run.lease_token,
      ]);
    }
    if (plan.skillId === 'blocked' || plan.skillId === 'unsupported') {
      await finishRun(
        run,
        'BLOCKED',
        plan.reason ?? 'This command is outside the available business skills.',
        { plan, externalAction: false },
      );
      return;
    }
    const skill = OS_SKILLS.find((s) => s.id === plan.skillId)!;
    const property = propertyForPlan(plan, run, state);
    if (skill.requiresProperty && !property)
      throw new ServiceError(
        'Choose a property or include its permanent Deal ID, then run this skill again.',
      );
    if (property) {
      run.property_id = property.id;
      await pool.query('UPDATE os_runs SET property_id=$1 WHERE id=$2 AND lease_token=$3', [
        property.id,
        run.id,
        run.lease_token,
      ]);
      await event(pool, run, 'INFO', `Selected ${property.dealId} · ${property.address}.`);
    }
    if (await cancelledBeforeTool(run)) return;
    const tool = (input: R) =>
      executeAction(actor, { ...input, mode: run.mode, idempotencyKey: `os:${run.id}:tool` });
    let result: R = {};
    let content = '';
    let status = 'COMPLETED';
    if (plan.skillId === 'morning_brief') {
      const pending = state.approvals.filter((a: R) => a.status === 'PENDING');
      const due = state.tasks.filter(
        (t: R) =>
          !['DONE', 'FAILED'].includes(t.status) &&
          t.dueDate &&
          Date.parse(t.dueDate) <= Date.now() + 86400000,
      );
      const risks = state.properties.filter(
        (p: R) => p.riskGrade === 'RED' && !['CLOSED', 'DEAD', 'LOST'].includes(p.stage),
      );
      result = {
        summary: state.summary,
        pendingApprovals: pending.map((a: R) => ({
          id: a.id,
          action: a.action,
          propertyId: a.propertyId,
        })),
        dueTasks: due.slice(0, 20),
        highestRiskDeals: risks.map((p: R) => ({
          id: p.id,
          dealId: p.dealId,
          address: p.address,
          reasons: p.riskReasons,
        })),
        source: 'Canonical PostgreSQL workspace',
      };
      content = `Your ${run.mode} morning brief\n\n${state.summary.activeLeads} active opportunities; ${pending.length} decisions await owner approval. ${due.length} internal tasks are due within a day, and ${risks.length} active deals have Red Team blockers.\n\nProjected assignment revenue: ${displayMoney(state.summary.projectedRevenue)}. Probability-weighted pipeline: ${displayMoney(state.summary.weightedPipeline)}. Realized revenue: ${displayMoney(state.summary.revenue)}; recorded expenses: ${displayMoney(state.summary.expenses)}; net profit: ${displayMoney(state.summary.netProfit)}.\n\nReview the approval inbox and upcoming deadlines first. These figures come from the canonical database; they are not LLM calculations.`;
    } else if (plan.skillId === 'plan_today') {
      await event(
        pool,
        run,
        'INFO',
        'Running internal data-quality and deadline scan. No external contacts will be made.',
      );
      result = await tool({ action: 'scan' });
      const fresh = await getState(run.mode);
      const tasks = fresh.tasks
        .filter((t: R) => !['DONE', 'FAILED'].includes(t.status))
        .sort((a: R, b: R) =>
          String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')),
        )
        .slice(0, 12);
      result = { ...result, tasks, externalAction: false };
      content = `Today's priorities\n\nChecked ${result.propertiesReviewed ?? 0} properties and ${result.deadlinesReviewed ?? 0} deadlines. Internal reminders and correction tasks are now persisted.\n\n${tasks.map((t: R, i: number) => `${i + 1}. ${t.title}${t.dueDate ? ` — due ${t.dueDate.slice(0, 10)}` : ''}`).join('\n') || 'No outstanding tasks were found.'}\n\nNo seller or buyer was contacted.`;
    } else if (plan.skillId === 'pipeline_report') {
      result = { summary: state.summary, source: 'Canonical PostgreSQL workspace' };
      content = `Pipeline report · ${run.mode}\n\n${state.summary.pipeline
        .filter((s: R) => s.count)
        .map((s: R) => `${s.stage}: ${s.count}`)
        .join(
          '\n',
        )}\n\nProjected assignment revenue: ${displayMoney(state.summary.projectedRevenue)}\nProbability-weighted pipeline: ${displayMoney(state.summary.weightedPipeline)}\nRealized revenue: ${displayMoney(state.summary.revenue)}\nExpenses: ${displayMoney(state.summary.expenses)}\nNet profit: ${displayMoney(state.summary.netProfit)}\n\nClose probability is an estimate. Financial totals use the deterministic ledger service.`;
    } else if (plan.skillId === 'memory_recall') {
      const notes = (
        await pool.query(
          'SELECT id,title,content,tags FROM os_memory WHERE actor_id=$1 AND mode=$2 ORDER BY updated_at DESC LIMIT 30',
          [actor.id, run.mode],
        )
      ).rows;
      result = { notes, source: 'Your persisted memory notes', instructionsExecuted: false };
      content = notes.length
        ? `Memory recalled · ${notes.length} saved notes\n\n${notes.map((n) => `${n.title}\n${n.content.slice(0, 2000)}`).join('\n\n')}\n\nThese notes are reference data; they cannot override approval, contact, or permission rules.`
        : 'Your vault has no saved notes in this workspace. Use Memory to record your operating context, then recall it here. Notes persist across sessions and are isolated between DEMO and LIVE.';
    } else if (plan.skillId === 'research_property') {
      status = 'BLOCKED';
      result = {
        providerStatus: 'NOT CONFIGURED',
        externalAction: false,
        propertyId: property!.id,
      };
      content =
        'Property research is NOT CONFIGURED. No public records were searched and no data was fabricated. Add sourced records manually or configure an authorized property-data adapter.';
    } else if (plan.skillId === 'underwrite') {
      await event(
        pool,
        run,
        'INFO',
        'Dispatching deterministic underwriting through the existing permission and evidence gates.',
      );
      result = await tool({ action: 'underwriting', propertyId: property!.id });
      content = `Underwriting complete · ${property!.dealId}\n\nARV base: ${displayMoney(result.arvBase)}\nRepairs expected: ${displayMoney(result.repairExpected)}\nMaximum allowable offer: ${displayMoney(result.mao)}\nRecommended offer: ${displayMoney(result.recommendedOffer)}\nProjected assignment fee: ${displayMoney(result.projectedAssignmentFee)}\nRed Team grade: ${result.riskGrade}\n\nAssumptions and scenarios are saved on the property. No offer was approved or sent.`;
    } else if (plan.skillId === 'match_buyers') {
      await event(
        pool,
        run,
        'INFO',
        'Matching buyers with deterministic geography, price, rehab, evidence, and reliability scores.',
      );
      const matches = await tool({ action: 'match', propertyId: property!.id });
      result = { matches };
      content = `Buyer matching complete · ${property!.dealId}\n\n${matches.length} eligible matches saved.\n${matches
        .slice(0, 8)
        .map((m: R) => `${m.buyerName}: ${m.score}% — ${(m.reasons ?? []).join('; ')}`)
        .join(
          '\n',
        )}\n\nNo buyer was selected or contacted. Review the scored matches in the deal workspace.`;
    } else if (plan.skillId === 'prepare_offer') {
      await event(
        pool,
        run,
        'INFO',
        'Preparing a proposed offer for owner approval. No external delivery is allowed from chat.',
      );
      result = await tool({
        action: 'requestOffer',
        propertyId: property!.id,
        ...(plan.amount ? { amount: plan.amount } : {}),
        reason: plan.reason ?? 'Prepared from the agentic command layer for owner review',
      });
      content = `Offer prepared for owner review · ${property!.dealId}\n\nProposed amount: ${displayMoney(result.amount)}\nApproval ID: ${result.id}\nStatus: ${result.status}\n\nOpen the approval inbox to inspect supporting assumptions and approve, edit, or reject. This run did not approve an offer, send a message, sign a contract, or make a commitment.`;
    } else if (plan.skillId === 'risk_review') {
      await event(pool, run, 'INFO', 'Running the bounded RED TEAM executor.');
      result = await tool({ action: 'runAgent', agent: 'RED TEAM', propertyId: property!.id });
      if (['FAILED', 'BLOCKED'].includes(result.status)) {
        status = result.status;
        content = `Red Team ${result.status.toLowerCase()}: ${result.error?.message ?? result.output?.summary ?? 'Review the run output and resolve missing evidence.'}`;
      } else
        content = `Red Team review complete · ${property!.dealId}\n\n${result.output?.summary ?? 'Risk grade and supporting reasons have been saved on the property.'}\n\n${JSON.stringify(result.output?.evidence ?? result.output, null, 2)}\n\nNo deal stage or owner decision was changed.`;
    }
    await finishRun(run, status, content, {
      skillId: plan.skillId,
      propertyId: property?.id ?? null,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown command execution failure';
    const code = (e as { code?: string })?.code;
    if (
      code &&
      ['40001', '40P01', 'ECONNRESET', 'ETIMEDOUT'].includes(code) &&
      run.attempts < run.max_attempts
    ) {
      await pool.query(
        "UPDATE os_runs SET status='QUEUED',run_after=now()+interval '10 seconds',lease_token=NULL,leased_at=NULL,error=$1 WHERE id=$2 AND lease_token=$3",
        [JSON.stringify({ message, code, retryable: true }), run.id, run.lease_token],
      );
      await event(
        pool,
        run,
        'WARNING',
        'A transient failure interrupted the run. It is queued for a bounded retry with the same idempotency key.',
      );
      return;
    }
    const status = e instanceof ServiceError ? 'BLOCKED' : 'FAILED';
    await finishRun(
      run,
      status,
      `${status === 'BLOCKED' ? 'Action blocked' : 'Run failed'}: ${message}\n\nNo approval, signature, external message, or funds movement was performed by this command. Resolve the prerequisite and start a new run.`,
      {},
      { message, code: code ?? 'OS_COMMAND_ERROR', retryable: false, at: stamp() },
    );
  }
}
export async function processOsRuns(rawMode: Mode, limit = 4) {
  if (rawMode !== 'DEMO' && rawMode !== 'LIVE') throw new ServiceError('Invalid mode');
  const runs = await transaction(async (db) => {
    await db.query(
      'INSERT INTO os_worker_state(mode,worker_id,last_seen_at) VALUES($1,$2,now()) ON CONFLICT(mode) DO UPDATE SET worker_id=EXCLUDED.worker_id,last_seen_at=now()',
      [rawMode, `worker:${process.pid}`],
    );
    const exhausted = await db.query(
      "SELECT * FROM os_runs WHERE mode=$1 AND status='RUNNING' AND leased_at<now()-interval '5 minutes' AND attempts>=max_attempts FOR UPDATE",
      [rawMode],
    );
    for (const run of exhausted.rows) {
      await db.query(
        "UPDATE os_runs SET status='FAILED',completed_at=now(),lease_token=NULL,error=$1 WHERE id=$2",
        [
          JSON.stringify({
            message: 'Worker lease expired after maximum attempts',
            retryable: false,
          }),
          run.id,
        ],
      );
      await db.query(
        "INSERT INTO os_messages(mode,actor_id,session_id,run_id,role,content) VALUES($1,$2,$3,$4,'ASSISTANT',$5) ON CONFLICT(run_id,role) DO NOTHING",
        [
          run.mode,
          run.actor_id,
          run.session_id,
          run.id,
          'Run failed after repeated worker interruptions. Inspect its events. Any already committed action remains audited; idempotency prevents duplicate tool effects.',
        ],
      );
      await event(
        db,
        run,
        'ERROR',
        'Worker lease expired after maximum attempts. Manual investigation required.',
      );
    }
    await db.query(
      "UPDATE os_runs SET status='QUEUED',lease_token=NULL,leased_at=NULL,run_after=now() WHERE mode=$1 AND status='RUNNING' AND leased_at<now()-interval '5 minutes' AND attempts<max_attempts",
      [rawMode],
    );
    const pending = await db.query(
      "SELECT * FROM os_runs WHERE mode=$1 AND status='QUEUED' AND run_after<=now() ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED",
      [rawMode, Math.max(1, Math.min(20, Math.floor(limit)))],
    );
    const claimed: R[] = [];
    for (const run of pending.rows) {
      const token = randomUUID();
      const updated = (
        await db.query(
          "UPDATE os_runs SET status='RUNNING',attempts=attempts+1,started_at=COALESCE(started_at,now()),leased_at=now(),lease_token=$1 WHERE id=$2 RETURNING *",
          [token, run.id],
        )
      ).rows[0];
      await event(db, updated, 'INFO', 'Background worker claimed this command.');
      claimed.push(updated);
    }
    return claimed;
  });
  for (const run of runs) await runOne(run);
  return { processed: runs.length, runIds: runs.map((r) => r.id) };
}
