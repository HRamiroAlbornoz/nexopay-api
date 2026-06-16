import pool from '../db/connection';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateUserData {
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string | null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, email, password_hash, first_name, last_name, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, email, password_hash, first_name, last_name, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash, first_name, last_name, created_at, updated_at`,
    [data.email, data.password_hash, data.first_name, data.last_name]
  );

  return result.rows[0];
}
