import pool from '../db/connection';
import { withDbTransaction } from '../db/with-transaction';
import { AppError } from '../middleware/error.middleware';
import { SavingsGoal, CreateSavingsGoalInput } from '../types/savings-goal.types';
import { Transaction, TX_COLS } from './transaction.queries';
import { debitBalance } from './balance.queries';
import { FLOAT_EPSILON } from '../types/currency.types';

const GOAL_COLS = `
  id, wallet_id, title, target_amount::float8 AS target_amount,
  current_amount::float8 AS current_amount, currency_code, status,
  target_date, created_at, updated_at
`;

export async function createSavingsGoal(data: CreateSavingsGoalInput): Promise<SavingsGoal> {
  const { walletId, title, targetAmount, currencyCode, targetDate } = data;

  const result = await pool.query<SavingsGoal>(
    `INSERT INTO savings_goals (wallet_id, title, target_amount, currency_code, target_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${GOAL_COLS}`,
    [walletId, title, targetAmount, currencyCode, targetDate ?? null]
  );

  return result.rows[0];
}

export async function getSavingsGoalsByWalletId(walletId: string): Promise<SavingsGoal[]> {
  const result = await pool.query<SavingsGoal>(
    `SELECT ${GOAL_COLS} FROM savings_goals WHERE wallet_id = $1 ORDER BY created_at DESC`,
    [walletId]
  );

  return result.rows;
}

// Fondea una meta de ahorro: bloquea primero la fila de la meta y después la del
// balance (siempre en ese orden) para que dos fondeos concurrentes de la misma meta
// no pisen el cálculo de current_amount. Rechaza si la meta no está activa, si el
// monto supera lo que falta para completarla, o si el saldo de la wallet no alcanza.
export async function fundSavingsGoal(
  goalId: string,
  walletId: string,
  amount: number
): Promise<{ goal: SavingsGoal; transaction: Transaction }> {
  return withDbTransaction(async (client) => {
    const goalResult = await client.query<SavingsGoal>(
      `SELECT ${GOAL_COLS} FROM savings_goals WHERE id = $1 AND wallet_id = $2 FOR UPDATE`,
      [goalId, walletId]
    );
    const goal = goalResult.rows[0];

    if (!goal) {
      throw new AppError('GOAL_NOT_FOUND', 'Meta de ahorro no encontrada', 404);
    }

    if (goal.status !== 'active') {
      throw new AppError('GOAL_NOT_ACTIVE', 'Esta meta ya no está activa', 422);
    }

    const remaining = goal.target_amount - goal.current_amount;
    if (amount > remaining + FLOAT_EPSILON) {
      throw new AppError(
        'AMOUNT_EXCEEDS_REMAINING',
        `El monto supera lo que falta para completar la meta (faltan ${remaining.toFixed(2)})`,
        422,
        { remaining }
      );
    }

    const balanceResult = await client.query<{ amount: number }>(
      `SELECT amount::float8 AS amount FROM balances
       WHERE wallet_id = $1 AND currency_code = $2
       FOR UPDATE`,
      [walletId, goal.currency_code]
    );
    const balance = balanceResult.rows[0]?.amount ?? 0;

    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 422, {
        available: balance,
        required: amount,
        currency: goal.currency_code,
      });
    }

    await debitBalance(client, walletId, goal.currency_code, amount);

    const newCurrentAmount = goal.current_amount + amount;
    const newStatus = newCurrentAmount >= goal.target_amount - FLOAT_EPSILON ? 'completed' : 'active';

    const updatedGoalResult = await client.query<SavingsGoal>(
      `UPDATE savings_goals SET current_amount = $1, status = $2 WHERE id = $3
       RETURNING ${GOAL_COLS}`,
      [newCurrentAmount, newStatus, goalId]
    );

    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate)
       VALUES ($1, 'savings_goal_fund', 'completed', $2, $2, $3, $3, 1)
       RETURNING ${TX_COLS}`,
      [walletId, goal.currency_code, amount]
    );

    return { goal: updatedGoalResult.rows[0], transaction: txResult.rows[0] };
  });
}
