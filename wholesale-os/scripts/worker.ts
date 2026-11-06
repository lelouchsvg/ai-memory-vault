import { executeAction } from '../src/lib/service';
import { pool } from '../src/lib/db';
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
console.log('Control Tower worker started. Durable queue and deadline checks every 30 seconds.');
while (!stopping) {
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
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (stopping) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, 30_000);
  });
}
await pool.end();
