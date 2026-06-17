import { PoolClient } from 'pg';
import pool from '../db/connection';
import { Wallet, Balance } from '../types/wallet.types';
import { SUPPORTED_CURRENCIES } from '../types/currency.types';
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

export const findWalletByUserEmail = async (email: string): Promise<Wallet | null> => {
  const result = await pool.query(
    `SELECT w.id, w.user_id, w.created_at
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE u.email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
};

export const getWalletByUserId = findWalletByUserId;