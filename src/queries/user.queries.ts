import { PoolClient } from 'pg';
import pool from '../db/connection';
import { withDbTransaction } from '../db/with-transaction';
import { createWallet } from './wallet.queries';
import { Wallet } from '../types/wallet.types';
import { AppError } from '../middleware/error.middleware';

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  first_name: string;
  last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateUserData {
  email: string;
  password_hash: string | null;
  first_name: string;
  last_name: string | null;
  google_sub?: string | null;
}

const USER_COLUMNS = 'id, email, password_hash, google_sub, first_name, last_name, created_at, updated_at';
const UNIQUE_VIOLATION_CODE = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);

  return result.rows[0] ?? null;
}

export async function findUserByGoogleSub(googleSub: string): Promise<User | null> {
  const result = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = $1`, [googleSub]);

  return result.rows[0] ?? null;
}

export async function linkGoogleSubToUser(userId: string, googleSub: string): Promise<User | null> {
  const result = await pool.query<User>(
    `UPDATE users SET google_sub = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
    [googleSub, userId]
  );

  return result.rows[0] ?? null;
}

export async function createUser(data: CreateUserData, client?: PoolClient): Promise<User> {
  const db = client ?? pool;
  const result = await db.query<User>(
    `INSERT INTO users (email, password_hash, first_name, last_name, google_sub)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [data.email, data.password_hash, data.first_name, data.last_name, data.google_sub ?? null]
  );

  return result.rows[0];
}

export async function createUserWithWallet(data: CreateUserData): Promise<{ user: User; wallet: Wallet }> {
  try {
    return await withDbTransaction(async (client) => {
      const user = await createUser(data, client);
      const wallet = await createWallet(user.id, client);
      return { user, wallet };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email', 409);
    }
    throw error;
  }
}
