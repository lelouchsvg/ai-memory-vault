import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

mkdirSync('.local', { recursive: true, mode: 0o700 });
if (!existsSync('.env.local')) {
  const password = randomBytes(24).toString('hex');
  const demoPassword = randomBytes(24).toString('hex');
  writeFileSync(
    '.env.local',
    `DATABASE_URL=postgresql://wholesale:${password}@127.0.0.1:54329/wholesale\nAPP_ORIGIN=http://localhost:3000\nCOOKIE_SECURE=false\nDEMO_LOGIN_ENABLED=true\nDEMO_EMAIL=owner@demo.local\nDEMO_PASSWORD=${demoPassword}\n`,
    { mode: 0o600, flag: 'wx' },
  );
}
process.loadEnvFile('.env.local');
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== '127.0.0.1' || url.port !== '54329') {
  throw new Error(
    'db:start manages only the local PostgreSQL server on 127.0.0.1:54329. For a managed database use db:migrate directly.',
  );
}
const databaseDir = resolve('.local/postgres');
const pg = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: 54329,
  persistent: true,
  authMethod: 'scram-sha-256',
  autoRehydrateSymlinks: true,
  postgresFlags: [
    '-c',
    'listen_addresses=127.0.0.1',
    '-c',
    `unix_socket_directories=${resolve('.local')}`,
  ],
  onLog: () => {},
  onError: (error: unknown) => {
    const msg = String(error);
    if (/FATAL|ERROR/.test(msg)) console.error(msg);
  },
});
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await pg.initialise();
else if (readFileSync(resolve(databaseDir, 'PG_VERSION'), 'utf8').trim() !== '18')
  throw new Error(
    'Local PostgreSQL major version mismatch. Back up and migrate the data before upgrading.',
  );
await pg.start();
const client = pg.getPgClient('postgres', '127.0.0.1');
await client.connect();
const dbName = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*$/.test(dbName)) throw new Error('Invalid database name.');
if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount)
  await client.query(`CREATE DATABASE "${dbName}"`);
await client.end();
console.log('PostgreSQL is ready on 127.0.0.1:54329. Data persists in .local/postgres.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => {}, 60_000);
