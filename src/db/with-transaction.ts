import { PoolClient } from 'pg';
import pool from './connection';

// Envuelve fn en BEGIN/COMMIT, con ROLLBACK y release garantizados ante cualquier error.
export async function withDbTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
