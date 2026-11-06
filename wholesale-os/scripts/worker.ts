import { executeAction } from '../src/lib/service';
import { pool } from '../src/lib/db';
import { processOsRuns } from '../src/lib/os-service';
let stopping = false;
async function heartbeat() {
  for (const mode of ['DEMO', 'LIVE'])
    await pool.query(
      'INSERT INTO os_worker_state(mode,worker_id,last_seen_at) VALUES($1,$2,now()) ON CONFLICT(mode) DO UPDATE SET worker_id=EXCLUDED.worker_id,last_seen_at=now()',
      [mode, `worker:${process.pid}`],
    );
}
const heartbeatTimer = setInterval(() => {
  void heartbeat().catch(() => console.error('os_worker_heartbeat_failed'));
}, 5_000);
process.on('SIGTERM', () => {
  stopping = true;
  clearInterval(heartbeatTimer);
});
process.on('SIGINT', () => {
  stopping = true;
  clearInterval(heartbeatTimer);
});
console.log(
  'Control Tower worker started. Agentic commands every 2 seconds; business queue and deadlines every 30 seconds.',
);
let nextBusinessTick = 0;
while (!stopping) {
  for (const mode of ['DEMO', 'LIVE'] as const) {
    try {
      await processOsRuns(mode);
    } catch (e) {
      console.error('os_worker_tick_failed', mode, e instanceof Error ? e.message : 'unknown');
    }
  }
  if (Date.now() >= nextBusinessTick) {
    nextBusinessTick = Date.now() + 30_000;
    for (const mode of ['DEMO', 'LIVE'] as const) {
      try {
        await executeAction(
          { id: 'system:worker', email: 'system:worker', role: 'OWNER' },
          { action: 'runJobs', mode },
        );
      } catch (e) {
        console.error('worker_tick_failed', mode, e instanceof Error ? e.message : 'unknown');
      }
    }
  }
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (stopping) {
        clearInterval(timer);
        clearTimeout(timeout);
        resolve();
      }
    }, 500);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, 2_000);
  });
}
await pool.end();
