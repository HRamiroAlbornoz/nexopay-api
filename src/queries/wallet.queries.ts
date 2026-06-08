import pool from '../db/connection';

export interface Wallet {
  id: string;
  user_id: string;
  created_at: Date;
}

const INITIAL_CURRENCIES = ['ARS', 'USD', 'EUR'] as const;

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
