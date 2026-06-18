import { PoolClient } from 'pg';
import pool from '../db/connection';
import { Wallet, Balance, BalanceHistoryPoint, WalletLookupResult } from '../types/wallet.types';
import { SUPPORTED_CURRENCIES, CurrencyCode } from '../types/currency.types';
import { AppError } from '../middleware/error.middleware';

export const findWalletByUserId = async (userId: string): Promise<Wallet | null> => {
  const result = await pool.query('SELECT id, user_id, created_at FROM wallets WHERE user_id = $1', [userId]);
  return result.rows[0] ?? null;
};

export const findWalletByUserIdOrThrow = async (userId: string): Promise<Wallet> => {
  const wallet = await findWalletByUserId(userId);
  if (!wallet) {
    throw new AppError('WALLET_NOT_FOUND', 'No se encontró una wallet para este usuario', 404);
  }
  return wallet;
};

export const createWallet = async (userId: string, existingClient?: PoolClient): Promise<Wallet> => {
  const client = existingClient ?? (await pool.connect());
  const ownsTransaction = !existingClient;

  try {
    if (ownsTransaction) {
      await client.query('BEGIN');
    }

    const walletResult = await client.query(
      'INSERT INTO wallets (user_id) VALUES ($1) RETURNING id, user_id, created_at',
      [userId]
    );
    const wallet = walletResult.rows[0];

    const valuesClause = SUPPORTED_CURRENCIES.map((_, i) => `($1, $${i + 2}, 0)`).join(', ');
    await client.query(
      `INSERT INTO balances (wallet_id, currency_code, amount) VALUES ${valuesClause}`,
      [wallet.id, ...SUPPORTED_CURRENCIES]
    );

    if (ownsTransaction) {
      await client.query('COMMIT');
    }
    return wallet;
  } catch (error) {
    if (ownsTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      client.release();
    }
  }
};

export const getBalancesByWalletId = async (walletId: string): Promise<Balance[]> => {
  const result = await pool.query(
    'SELECT currency_code, amount::float8 AS amount FROM balances WHERE wallet_id = $1 ORDER BY currency_code',
    [walletId]
  );
  return result.rows;
};

export const findWalletByUserEmail = async (email: string): Promise<WalletLookupResult | null> => {
  const result = await pool.query(
    `SELECT w.id, w.user_id, w.created_at, u.first_name, u.last_name
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
};

interface TransactionDeltaRow {
  type: string;
  currency_from: CurrencyCode;
  currency_to: CurrencyCode;
  amount_from: number;
  amount_to: number;
  created_at: Date;
}

const DEBIT_FROM_TYPES = new Set(['buy', 'sell', 'exchange', 'transfer_out', 'savings_goal_fund', 'shared_expense_paid']);
const CREDIT_FROM_TYPES = new Set(['transfer_in', 'shared_expense_received']);

// Aplica el efecto de una transacción tal como ocurrió realmente, en orden cronológico
// (no es una reversión) — así el balance acumulado en cualquier punto coincide exactamente
// con lo que `balances` tendría en ese momento, para cualquiera de los 8 tipos del ledger.
function applyTransactionDelta(balances: Record<CurrencyCode, number>, row: TransactionDeltaRow): void {
  if (DEBIT_FROM_TYPES.has(row.type)) {
    balances[row.currency_from] -= row.amount_from;
  } else if (CREDIT_FROM_TYPES.has(row.type)) {
    balances[row.currency_from] += row.amount_from;
  }

  if (row.type === 'buy' || row.type === 'sell' || row.type === 'exchange') {
    balances[row.currency_to] += row.amount_to;
  }
}

function toUTCDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function zeroBalances(): Record<CurrencyCode, number> {
  return Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => [currency, 0])) as Record<CurrencyCode, number>;
}

export const getBalanceHistoryByWalletId = async (walletId: string, days: number): Promise<BalanceHistoryPoint[]> => {
  const result = await pool.query<TransactionDeltaRow>(
    `SELECT type, currency_from, currency_to,
            amount_from::float8 AS amount_from, amount_to::float8 AS amount_to, created_at
     FROM transactions
     WHERE wallet_id = $1
     ORDER BY created_at ASC`,
    [walletId]
  );

  const rangeStart = new Date();
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1));
  const rangeStartLabel = toUTCDateLabel(rangeStart);

  const runningBalance = zeroBalances();
  const dailySnapshots = new Map<string, Record<CurrencyCode, number>>();
  let baseline: Record<CurrencyCode, number> | null = null;

  for (const row of result.rows) {
    const dateLabel = toUTCDateLabel(row.created_at);
    if (dateLabel >= rangeStartLabel && baseline === null) {
      baseline = { ...runningBalance };
    }

    applyTransactionDelta(runningBalance, row);

    if (dateLabel >= rangeStartLabel) {
      dailySnapshots.set(dateLabel, { ...runningBalance });
    }
  }

  let carry = baseline ?? { ...runningBalance };
  const history: BalanceHistoryPoint[] = [];

  for (let i = 0; i < days; i++) {
    const cursor = new Date(rangeStart);
    cursor.setUTCDate(cursor.getUTCDate() + i);
    const dateLabel = toUTCDateLabel(cursor);

    const snapshot = dailySnapshots.get(dateLabel);
    if (snapshot) {
      carry = snapshot;
    }

    history.push({ date: dateLabel, ...carry });
  }

  return history;
};
