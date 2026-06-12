import pool from '../db/connection';
import { SUPPORTED_CURRENCIES } from '../types/currency.types';

export interface Wallet {
  id: string;
  user_id: string;
  created_at: Date;
}

const INITIAL_CURRENCIES = SUPPORTED_CURRENCIES;

export async function createWallet(userId: string): Promise<Wallet> {
  const result = await pool.query<Wallet>(
    `INSERT INTO wallets (user_id)
     VALUES ($1)
     RETURNING id, user_id, created_at`,
    [userId]
  );

  return result.rows[0];
}

export async function createInitialBalances(walletId: string): Promise<void> {
  for (const currency of INITIAL_CURRENCIES) {
    await pool.query(
      `INSERT INTO balances (wallet_id, currency_code, amount)
       VALUES ($1, $2, 0)`,
      [walletId, currency]
    );
  }
}

export async function getWalletByUserId(userId: string): Promise<Wallet | null> {
  const result = await pool.query<Wallet>(
    `SELECT id, user_id, created_at FROM wallets WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function findWalletByUserEmail(email: string): Promise<Wallet | null> {
  const result = await pool.query<Wallet>(
    `SELECT w.id, w.user_id, w.created_at
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE u.email = $1`,
    [email]
  );

  return result.rows[0] ?? null;
}
