import pool from '../db/connection';
import { CurrencyCode } from '../types/currency.types';
import { AppError } from '../middleware/error.middleware';

export interface Transaction {
  id: string;
  wallet_id: string;
  type: 'buy' | 'sell' | 'exchange' | 'transfer_in' | 'transfer_out' | 'savings_goal_fund';
  status: 'pending' | 'completed' | 'failed';
  currency_from: string;
  currency_to: string;
  amount_from: number;
  amount_to: number;
  exchange_rate: number;
  related_wallet_id: string | null;
  created_at: Date;
}

interface ConversionData {
  walletId: string;
  type: 'buy' | 'sell' | 'exchange';
  currencyFrom: CurrencyCode;
  currencyTo: CurrencyCode;
  amountFrom: number;
  amountTo: number;
  exchangeRate: number;
}

interface TransferData {
  senderWalletId: string;
  recipientWalletId: string;
  currencyCode: CurrencyCode;
  amount: number;
}

export const TX_COLS = `
  id, wallet_id, type, status, currency_from, currency_to,
  amount_from::float8 AS amount_from, amount_to::float8 AS amount_to,
  exchange_rate::float8 AS exchange_rate, related_wallet_id, created_at
`;

export async function executeConversion(data: ConversionData): Promise<Transaction> {
  const { walletId, type, currencyFrom, currencyTo, amountFrom, amountTo, exchangeRate } = data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Bloquea ambas filas en orden canónico (currency_code alfabético) para evitar deadlocks
    // cuando dos operaciones inversas corren concurrentemente sobre la misma wallet
    const balancesResult = await client.query<{ currency_code: string; amount: number }>(
      `SELECT currency_code, amount::float8 AS amount FROM balances
       WHERE wallet_id = $1 AND currency_code IN ($2, $3)
       ORDER BY currency_code
       FOR UPDATE`,
      [walletId, currencyFrom, currencyTo]
    );

    const fromRow = balancesResult.rows.find((r) => r.currency_code === currencyFrom);
    const balance = fromRow?.amount ?? 0;

    if (balance < amountFrom) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 422, {
        available: balance,
        required: amountFrom,
        currency: currencyFrom,
      });
    }

    await client.query(
      `UPDATE balances SET amount = amount - $1 WHERE wallet_id = $2 AND currency_code = $3`,
      [amountFrom, walletId, currencyFrom]
    );

    const creditResult = await client.query(
      `UPDATE balances SET amount = amount + $1 WHERE wallet_id = $2 AND currency_code = $3`,
      [amountTo, walletId, currencyTo]
    );

    if ((creditResult.rowCount ?? 0) === 0) {
      throw new AppError('BALANCE_NOT_FOUND', 'El balance de destino no existe', 500, {
        walletId,
        currency: currencyTo,
      });
    }

    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate)
       VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7)
       RETURNING ${TX_COLS}`,
      [walletId, type, currencyFrom, currencyTo, amountFrom, amountTo, exchangeRate]
    );

    await client.query('COMMIT');

    return txResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeTransfer(data: TransferData): Promise<Transaction> {
  const { senderWalletId, recipientWalletId, currencyCode, amount } = data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Bloquea ambas filas en orden canónico (wallet_id lexicográfico) para evitar deadlocks
    // en transferencias mutuas simultáneas (A→B y B→A al mismo tiempo)
    const balancesResult = await client.query<{ wallet_id: string; amount: number }>(
      `SELECT wallet_id, amount::float8 AS amount FROM balances
       WHERE wallet_id IN ($1, $2) AND currency_code = $3
       ORDER BY wallet_id
       FOR UPDATE`,
      [senderWalletId, recipientWalletId, currencyCode]
    );

    const senderRow = balancesResult.rows.find((r) => r.wallet_id === senderWalletId);
    const balance = senderRow?.amount ?? 0;

    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 422, {
        available: balance,
        required: amount,
        currency: currencyCode,
      });
    }

    await client.query(
      `UPDATE balances SET amount = amount - $1 WHERE wallet_id = $2 AND currency_code = $3`,
      [amount, senderWalletId, currencyCode]
    );

    const creditResult = await client.query(
      `UPDATE balances SET amount = amount + $1 WHERE wallet_id = $2 AND currency_code = $3`,
      [amount, recipientWalletId, currencyCode]
    );

    if ((creditResult.rowCount ?? 0) === 0) {
      throw new AppError('BALANCE_NOT_FOUND', 'El balance del destinatario no existe', 500, {
        walletId: recipientWalletId,
        currency: currencyCode,
      });
    }

    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id)
       VALUES ($1, 'transfer_out', 'completed', $2, $2, $3, $3, 1, $4)
       RETURNING ${TX_COLS}`,
      [senderWalletId, currencyCode, amount, recipientWalletId]
    );

    await client.query(
      `INSERT INTO transactions (wallet_id, type, status, currency_from, currency_to, amount_from, amount_to, exchange_rate, related_wallet_id)
       VALUES ($1, 'transfer_in', 'completed', $2, $2, $3, $3, 1, $4)`,
      [recipientWalletId, currencyCode, amount, senderWalletId]
    );

    await client.query('COMMIT');

    return txResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTransactionsByWalletId(
  walletId: string,
  limit: number,
  offset: number
): Promise<Transaction[]> {
  const result = await pool.query<Transaction>(
    `SELECT ${TX_COLS} FROM transactions
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [walletId, limit, offset]
  );

  return result.rows;
}
