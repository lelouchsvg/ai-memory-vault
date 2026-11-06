import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { pool } from './db';

export type Actor = {
  id: string;
  email: string;
  role: 'OWNER' | 'OPERATOR' | 'VIEWER';
  demoOnly: boolean;
};
const cookieName = 'wholesale_session';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, saved: string) {
  const [salt, hash] = saved.split(':');
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || token.length !== 64) return null;
  const { rows } = await pool.query(
    `SELECT u.id,u.email,u.role,u.demo_only AS "demoOnly"
    FROM app_sessions s JOIN app_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}
export async function login(email: string, password: string, demo = false) {
  const key = tokenHash(email.toLowerCase());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`login:${key}`]);
    await client.query(
      "DELETE FROM auth_attempts WHERE attempted_at < now()-interval '20 minutes'",
    );
    const attempts = await client.query(
      "SELECT count(*) FROM auth_attempts WHERE key=$1 AND attempted_at>now()-interval '15 minutes'",
      [key],
    );
    if (Number(attempts.rows[0].count) >= 8)
      throw new Error('Too many sign-in attempts. Try again in 15 minutes.');
    await client.query('INSERT INTO auth_attempts(key) VALUES ($1)', [key]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const { rows } = await pool.query('SELECT * FROM app_users WHERE email=$1', [
    email.toLowerCase(),
  ]);
  const user = rows[0];
  const dummy = '00000000000000000000000000000000:' + '0'.repeat(128);
  const valid = verifyPassword(password, user?.password_hash ?? dummy);
  if (!valid || !user || (demo && !user.demo_only)) throw new Error('Invalid email or password.');
  const token = randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [tokenHash(token), user.id],
  );
  await pool.query('DELETE FROM auth_attempts WHERE key=$1', [key]);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: 43200,
  });
  return { email: user.email, role: user.role, demoOnly: user.demo_only };
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [tokenHash(token)]);
  jar.delete(cookieName);
}
export async function createUser(
  email: string,
  password: string,
  role: Actor['role'],
  demoOnly = false,
) {
  if (password.length < 12 || password.length > 256)
    throw new Error('Password must be 12–256 characters.');
  await pool.query(
    `INSERT INTO app_users(id,email,password_hash,role,demo_only) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(email) DO NOTHING`,
    [randomUUID(), email.toLowerCase(), hashPassword(password), role, demoOnly],
  );
}
export function assertOrigin(request: Request) {
  const allowed = new Set([
    process.env.APP_ORIGIN || 'http://localhost:3000',
    new URL(request.url).origin,
  ]);
  const origin = request.headers.get('origin');
  if (!origin || !allowed.has(origin)) throw new Error('Invalid request origin.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('Expected application/json.');
}
