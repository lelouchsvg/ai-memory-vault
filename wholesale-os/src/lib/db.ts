import pg, { type PoolClient, type QueryResultRow } from 'pg';

const globalDb = globalThis as typeof globalThis & { wholesalePool?: pg.Pool };
export const pool =
  globalDb.wholesalePool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/wholesale',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  });
if (process.env.NODE_ENV !== 'production') globalDb.wholesalePool = pool;
export type DB = Pick<PoolClient, 'query'>;
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
) {
  return pool.query<T>(sql, values);
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export function toRecord(row: Record<string, unknown>): Record<string, any> {
  return {
    ...((row.data as object) ?? {}),
    id: row.id,
    mode: row.mode,
    ...(row.deal_id ? { dealId: row.deal_id } : {}),
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    ...(row.seller_id ? { sellerId: row.seller_id } : {}),
    ...(row.buyer_id ? { buyerId: row.buyer_id } : {}),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}
