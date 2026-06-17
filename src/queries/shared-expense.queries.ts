import { PoolClient } from 'pg';
import pool from '../db/connection';
import { withDbTransaction } from '../db/with-transaction';
import { lockBalancesForUpdate, debitBalance, creditBalance } from './balance.queries';
import { AppError } from '../middleware/error.middleware';
import { SharedExpense, SharedExpenseMember, CreateSharedExpenseInput } from '../types/shared-expense.types';
import { Transaction, TX_COLS } from './transaction.queries';

const EXPENSE_COLS = `
  id, created_by_wallet_id, title, total_amount::float8 AS total_amount,
  currency_code, status, created_at
`;

const MEMBER_COLS = `
  id, wallet_id, amount_owed::float8 AS amount_owed, amount_paid::float8 AS amount_paid
`;

export async function validateWalletsExist(walletIds: string[], client?: PoolClient): Promise<void> {
  if (walletIds.length === 0) return;

  const db = client ?? pool;
  const result = await db.query<{ id: string }>('SELECT id FROM wallets WHERE id = ANY($1::uuid[])', [walletIds]);
  const foundIds = new Set(result.rows.map((row) => row.id));
  const missing = walletIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    throw new AppError('INVALID_WALLETS', `Las siguientes wallets no existen: ${missing.join(', ')}`, 422, {
      missing,
    });
  }
}

// Crea el gasto y todos sus miembros en una sola transacción. La parte del creador
// queda marcada como pagada desde el inicio: ya la cubrió al pagar el total, no tiene
// sentido que se transfiera plata a sí mismo para "saldarla".
export async function createExpenseWithMembers(data: CreateSharedExpenseInput): Promise<SharedExpense> {
  const { creatorWalletId, title, totalAmount, currencyCode, members } = data;

  return withDbTransaction(async (client) => {
    await validateWalletsExist(members.map((m) => m.walletId), client);

    const expenseResult = await client.query<SharedExpense>(
      `INSERT INTO shared_expenses (created_by_wallet_id, title, total_amount, currency_code, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING ${EXPENSE_COLS}`,
      [creatorWalletId, title, totalAmount, currencyCode]
    );
    const expense = expenseResult.rows[0];

    const walletIds = members.map((m) => m.walletId);
    const amountsOwed = members.map((m) => m.amountOwed);
    const amountsPaid = members.map((m) => (m.walletId === creatorWalletId ? m.amountOwed : 0));

    const membersResult = await client.query<SharedExpenseMember>(
      `INSERT INTO shared_expense_members (expense_id, wallet_id, amount_owed, amount_paid)
       SELECT $1, * FROM unnest($2::uuid[], $3::numeric[], $4::numeric[])
       RETURNING ${MEMBER_COLS}`,
      [expense.id, walletIds, amountsOwed, amountsPaid]
    );

    return { ...expense, members: membersResult.rows };
  });
}

export async function getSharedExpensesByWalletId(
  walletId: string,
  limit: number,
  offset: number
): Promise<SharedExpense[]> {
  const result = await pool.query<SharedExpense>(
    `SELECT
       e.id, e.created_by_wallet_id, e.title,
       e.total_amount::float8 AS total_amount, e.currency_code, e.status, e.created_at,
       COALESCE(
         json_agg(
           json_build_object(
             'id', m.id,
             'wallet_id', m.wallet_id,
             'amount_owed', m.amount_owed::float8,
             'amount_paid', m.amount_paid::float8
           )
         ) FILTER (WHERE m.id IS NOT NULL),
         '[]'
       ) AS members
     FROM shared_expenses e
     LEFT JOIN shared_expense_members m ON m.expense_id = e.id
     WHERE e.created_by_wallet_id = $1
        OR EXISTS (
          SELECT 1 FROM shared_expense_members sm
          WHERE sm.expense_id = e.id AND sm.wallet_id = $1
        )
     GROUP BY e.id, e.created_by_wallet_id, e.title, e.total_amount, e.currency_code, e.status, e.created_at
     ORDER BY e.created_at DESC
     LIMIT $2 OFFSET $3`,
    [walletId, limit, offset]
  );

  return result.rows;
}

// Salda la parte de un miembro: bloquea TODAS las filas de miembros del gasto (no solo
// la del pagador) para serializar liquidaciones concurrentes del mismo gasto. Esto evita
// una anomalía de lectura bajo READ COMMITTED: si dos liquidaciones de los últimos dos
// miembros pendientes corrieran en paralelo, cada una vería la actualización de la otra
// como "todavía no confirmada" y ninguna marcaría el gasto como 'settled'. Al bloquear
// el set completo, la segunda transacción espera a que la primera confirme antes de leer.
// Los balances (pagador/creador) se bloquean en orden canónico por wallet_id, igual que
// executeTransfer. Siempre paga el remanente completo — no hay pagos parciales.
export async function settleExpenseMember(
  expenseId: string,
  payerWalletId: string
): Promise<{ expense: SharedExpense; transaction: Transaction }> {
  return withDbTransaction(async (client) => {
    const membersResult = await client.query<SharedExpenseMember>(
      `SELECT ${MEMBER_COLS} FROM shared_expense_members WHERE expense_id = $1 FOR UPDATE`,
      [expenseId]
    );
    const members = membersResult.rows;
    const member = members.find((m) => m.wallet_id === payerWalletId);

    if (!member) {
      throw new AppError('NOT_MEMBER', 'No sos miembro de este gasto', 403);
    }

    const remaining = member.amount_owed - member.amount_paid;
    if (remaining <= 0) {
      throw new AppError('ALREADY_PAID', 'Ya pagaste tu parte', 422);
    }

    const expenseResult = await client.query<SharedExpense>(
      `SELECT ${EXPENSE_COLS} FROM shared_expenses WHERE id = $1`,
      [expenseId]
    );
    const expense = expenseResult.rows[0];

    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', 'Gasto no encontrado', 404);
    }

    const creatorWalletId = expense.created_by_wallet_id;

    const balances = await lockBalancesForUpdate(client, payerWalletId, creatorWalletId, expense.currency_code);
    const payerBalance = balances.get(payerWalletId) ?? 0;

    if (payerBalance < remaining) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 422, {
        available: payerBalance,
        required: remaining,
        currency: expense.currency_code,
      });
    }

    await debitBalance(client, payerWalletId, expense.currency_code, remaining);
    await creditBalance(client, creatorWalletId, expense.currency_code, remaining);

    await client.query(`UPDATE shared_expense_members SET amount_paid = amount_owed WHERE id = $1`, [member.id]);

    // El resto de los miembros ya está bloqueado en `members` (FOR UPDATE arriba) —
    // no hace falta una query nueva para saber si quedan pendientes.
    const updatedMembers = members.map((m) => (m.id === member.id ? { ...m, amount_paid: m.amount_owed } : m));
    const stillPending = updatedMembers.some((m) => m.amount_paid < m.amount_owed);

    if (!stillPending) {
      await client.query(`UPDATE shared_expenses SET status = 'settled' WHERE id = $1`, [expenseId]);
    }

    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id, shared_expense_id)
       VALUES ($1, 'shared_expense_paid', 'completed', $2, $2, $3, $3, 1, $4, $5)
       RETURNING ${TX_COLS}`,
      [payerWalletId, expense.currency_code, remaining, creatorWalletId, expenseId]
    );

    await client.query(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id, shared_expense_id)
       VALUES ($1, 'shared_expense_received', 'completed', $2, $2, $3, $3, 1, $4, $5)`,
      [creatorWalletId, expense.currency_code, remaining, payerWalletId, expenseId]
    );

    const updatedExpense: SharedExpense = {
      ...expense,
      status: stillPending ? expense.status : 'settled',
      members: updatedMembers,
    };

    return { expense: updatedExpense, transaction: txResult.rows[0] };
  });
}
