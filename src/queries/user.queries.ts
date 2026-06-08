import pool from '../db/connection';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
}

interface CreateUserData {
  email: string;
  password_hash: string;
  full_name: string;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, email, password_hash, full_name, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, email, password_hash, full_name, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, password_hash, full_name, created_at, updated_at`,
    [data.email, data.password_hash, data.full_name]
  );

  return result.rows[0];
}
