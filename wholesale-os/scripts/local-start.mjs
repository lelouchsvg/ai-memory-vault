import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Invoke npm's JavaScript CLI with Node; no PowerShell, Bash or execution-policy changes.
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(directory);
mkdirSync('.local', { recursive: true, mode: 0o700 });
const npmCli =
  process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli))
  throw new Error('npm was not found. Install Node.js 24 LTS and try again.');
const owned = [];
let stopping = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function loadConfig() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
}
async function databaseReady() {
  loadConfig();
  if (!process.env.DATABASE_URL) return false;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1500,
    max: 1,
  });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}
async function appReady() {
  try {
    const response = await fetch('http://localhost:3000/api/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] === 'Z') return false;
    }
    return true;
  } catch {
    return false;
  }
}
function start(script, name) {
  const fd = openSync(`.local/${name}.log`, 'a', 0o600);
  const child = spawn(process.execPath, [npmCli, 'run', script], {
    cwd: directory,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  closeSync(fd);
  child.on('error', (error) => console.error(`${name}: ${error.message}`));
  owned.push(child);
  if (child.pid) writeFileSync(`.local/${name}.pid`, String(child.pid));
  return child;
}
function run(script, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, 'run', script, ...extra], {
      cwd: directory,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} failed; read the output above.`)),
    );
  });
}
async function waitFor(check, child, name, seconds = 60) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline && !stopping) {
    if (await check()) return;
    if (child && child.exitCode !== null)
      throw new Error(`${name} stopped. Read .local/${name}.log.`);
    await pause(500);
  }
  throw new Error(`${name} did not become ready. Read .local/${name}.log.`);
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of [...owned].reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already stopped */
      }
    }
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  if (!(await databaseReady()))
    await waitFor(databaseReady, start('db:start', 'database'), 'database');
  loadConfig();
  await run('db:migrate');
  await run('db:seed');
  if (process.env.DEMO_LOGIN_ENABLED === 'true') await run('owner:create', ['--', '--demo']);
  if (!(await appReady()))
    await waitFor(
      appReady,
      start(process.argv.includes('--production') ? 'start' : 'dev', 'app'),
      'app',
    );
  const workerPid = existsSync('.local/worker.pid')
    ? Number(readFileSync('.local/worker.pid', 'utf8'))
    : 0;
  if (!alive(workerPid)) start('worker', 'worker');
  console.log('\nControl Tower is ready: http://localhost:3000/login?next=/os');
  console.log('Click Explore the demo. Keep this window open; press Ctrl+C to stop.');
  if (process.argv.includes('--open')) {
    const url = 'http://localhost:3000/login?next=/os';
    const [command, args] =
      process.platform === 'win32'
        ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]];
    const browser = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log(`Open your browser at ${url}`));
  }
  let unavailable = 0;
  while (!stopping) {
    await pause(2000);
    const failed = owned.find((child) => child.exitCode !== null);
    if (!stopping && failed)
      throw new Error('A service stopped. Read .local/app.log, database.log or worker.log.');
    if (!stopping) {
      unavailable = (await appReady()) && (await databaseReady()) ? 0 : unavailable + 1;
      if (unavailable >= 3)
        throw new Error(
          'A service became unavailable. Restart the launcher and review .local logs.',
        );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  shutdown();
}
