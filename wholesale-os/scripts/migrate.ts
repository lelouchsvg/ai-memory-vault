import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, transaction } from '../src/lib/db';

export async function migrate() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const result = await pool.query('SELECT checksum FROM schema_migrations WHERE name=$1', [file]);
    if (result.rowCount) {
      if (result.rows[0].checksum !== checksum)
        throw new Error('Applied migration changed: ' + file);
      continue;
    }
    await transaction(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [file, checksum]);
    });
    console.log('Applied migration ' + file);
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrate()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
