import pool from '../db/connection';
import { AppError } from '../middleware/error.middleware';

export interface ExpenseMember {
  id: string;
  wallet_id: string;
  amount_owed: number;
  amount_paid: number;
}

export interface Expense {
  id: string;
  created_by_wallet_id: string;
  title: string;
  total_amount: number;
  currency_code: string;
  status: 'pending' | 'settled';
  created_at: Date;
  members: ExpenseMember[];
}

export async function validateWalletsExist(walletIds: string[]): Promise<void> {
  if (walletIds.length === 0) return;
  const result = await pool.query(
    `SELECT id FROM wallets WHERE id = ANY($1::uuid[])`,
    [walletIds]
  );
  const foundIds = result.rows.map(row => row.id);
  const missing = walletIds.filter(id => !foundIds.includes(id));
  if (missing.length > 0) {
    throw new AppError('INVALID_WALLETS', `Las siguientes wallets no existen: ${missing.join(', ')}`, 422);
  }
}

export async function checkAndUpdateExpenseStatus(expenseId: string): Promise<void> {
  const result = await pool.query(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN amount_paid >= amount_owed THEN 1 ELSE 0 END) as settled
     FROM shared_expense_members
     WHERE expense_id = $1`,
    [expenseId]
  );
  const total = parseInt(result.rows[0].total);
  const settled = parseInt(result.rows[0].settled);
  if (total === settled) {
    await pool.query(
      `UPDATE shared_expenses SET status = 'settled' WHERE id = $1 AND status != 'settled'`,
      [expenseId]
    );
  }
}

export async function createExpenseWithMembers(
  creatorWalletId: string,
  title: string,
  totalAmount: number,
  currencyCode: string,
  members: { wallet_id: string; amount_owed: number }[]
): Promise<Expense> {
  const walletIds = members.map(m => m.wallet_id);
  await validateWalletsExist(walletIds);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sum = members.reduce((acc, m) => acc + m.amount_owed, 0);
    if (Math.abs(sum - totalAmount) > 0.000001) {
      throw new AppError('INVALID_TOTAL', 'La suma de las partes no coincide con el total', 422);
    }

    const expenseResult = await client.query(
      `INSERT INTO shared_expenses (created_by_wallet_id, title, total_amount, currency_code, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, created_by_wallet_id, title, total_amount::float8 AS total_amount, currency_code, status, created_at`,
      [creatorWalletId, title, totalAmount, currencyCode]
    );
    const expense = expenseResult.rows[0];

    for (const member of members) {
      await client.query(
        `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
         VALUES ($1, $2, $3, 0)`,
        [expense.id, member.wallet_id, member.amount_owed]
      );
    }

    const membersResult = await client.query(
      `SELECT id, wallet_id, amount_owed::float8 AS amount_owed, amount_paid::float8 AS amount_paid
       FROM shared_expense_members WHERE expense_id = $1`,
      [expense.id]
    );
    expense.members = membersResult.rows;

    await client.query('COMMIT');
    return expense;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  const expenseResult = await pool.query(
    `SELECT id, created_by_wallet_id, title, total_amount::float8 AS total_amount,
            currency_code, status, created_at
     FROM shared_expenses WHERE id = $1`,
    [expenseId]
  );
  if (expenseResult.rows.length === 0) return null;
  const expense = expenseResult.rows[0];

  const membersResult = await pool.query(
    `SELECT id, wallet_id, amount_owed::float8 AS amount_owed, amount_paid::float8 AS amount_paid
     FROM shared_expense_members WHERE expense_id = $1`,
    [expenseId]
  );
  expense.members = membersResult.rows;
  return expense;
}

export async function getMemberByExpenseAndWallet(expenseId: string, walletId: string) {
  const result = await pool.query(
    `SELECT id, expense_id, wallet_id, amount_owed::float8 AS amount_owed,
            amount_paid::float8 AS amount_paid
     FROM shared_expense_members
     WHERE expense_id = $1 AND wallet_id = $2`,
    [expenseId, walletId]
  );
  return result.rows[0] || null;
}

export async function updateMemberPaidAmount(memberId: string, newPaidAmount: number) {
  await pool.query(
    `UPDATE shared_expense_members
     SET amount_paid = $1
     WHERE id = $2`,
    [newPaidAmount, memberId]
  );
}

export async function getExpensesByWalletId(walletId: string): Promise<Expense[]> {
  const expensesResult = await pool.query(
    `SELECT DISTINCT e.id, e.created_by_wallet_id, e.title,
            e.total_amount::float8 AS total_amount, e.currency_code, e.status, e.created_at
     FROM shared_expenses e
     LEFT JOIN shared_expense_members m ON e.id = m.expense_id
     WHERE e.created_by_wallet_id = $1 OR m.wallet_id = $1
     ORDER BY e.created_at DESC`,
    [walletId]
  );
  const expenses = expensesResult.rows;
  for (const expense of expenses) {
    const membersResult = await pool.query(
      `SELECT id, wallet_id, amount_owed::float8 AS amount_owed, amount_paid::float8 AS amount_paid
       FROM shared_expense_members WHERE expense_id = $1`,
      [expense.id]
    );
    expense.members = membersResult.rows;
  }
  return expenses;
}