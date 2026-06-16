import pool from '../db/connection';
import { AppError } from '../middleware/error.middleware';

export interface SavingsGoal {
  id: string;
  wallet_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  status: 'active' | 'completed' | 'cancelled';
  target_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function createGoal(
  walletId: string,
  title: string,
  targetAmount: number,
  currencyCode: string,
  targetDate?: Date
): Promise<SavingsGoal> {
  const result = await pool.query(
    `INSERT INTO savings_goals (wallet_id, title, target_amount, currency_code, target_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, wallet_id, title, target_amount::float8 AS target_amount,
               current_amount::float8 AS current_amount, currency_code,
               status, target_date, created_at, updated_at`,
    [walletId, title, targetAmount, currencyCode, targetDate || null]
  );
  return result.rows[0];
}

export async function getGoalById(goalId: string): Promise<SavingsGoal | null> {
  const result = await pool.query(
    `SELECT id, wallet_id, title, target_amount::float8 AS target_amount,
            current_amount::float8 AS current_amount, currency_code,
            status, target_date, created_at, updated_at
     FROM savings_goals WHERE id = $1`,
    [goalId]
  );
  return result.rows[0] || null;
}

export async function getGoalsByWalletId(walletId: string): Promise<SavingsGoal[]> {
  const result = await pool.query(
    `SELECT id, wallet_id, title, target_amount::float8 AS target_amount,
            current_amount::float8 AS current_amount, currency_code,
            status, target_date, created_at, updated_at
     FROM savings_goals WHERE wallet_id = $1
     ORDER BY created_at DESC`,
    [walletId]
  );
  return result.rows;
}

export async function updateGoalCurrentAmount(
  goalId: string,
  newCurrentAmount: number
): Promise<void> {
  await pool.query(
    `UPDATE savings_goals SET current_amount = $1, updated_at = NOW()
     WHERE id = $2`,
    [newCurrentAmount, goalId]
  );
}

export async function updateGoalStatus(
  goalId: string,
  status: 'active' | 'completed' | 'cancelled'
): Promise<void> {
  await pool.query(
    `UPDATE savings_goals SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [status, goalId]
  );
}