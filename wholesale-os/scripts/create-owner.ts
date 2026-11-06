import { createUser } from '../src/lib/auth';
import { pool } from '../src/lib/db';
const demo = process.argv.includes('--demo');
const email = demo ? process.env.DEMO_EMAIL : process.env.OWNER_EMAIL;
const password = demo ? process.env.DEMO_PASSWORD : process.env.OWNER_PASSWORD;
const role = demo ? 'OWNER' : process.env.OWNER_ROLE || 'OWNER';
try {
  if (!email || !password)
    throw new Error('Set OWNER_EMAIL and OWNER_PASSWORD securely before running owner:create.');
  if (!['OWNER', 'OPERATOR', 'VIEWER'].includes(role)) throw new Error('Invalid OWNER_ROLE.');
  await createUser(email, password, role as 'OWNER' | 'OPERATOR' | 'VIEWER', demo);
  console.log(
    `${demo ? 'Demo-only' : 'Owner/operator'} account prepared. Existing accounts are preserved.`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Account creation failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
