import pool from '../db/connection';
import { Wallet, Balance } from '../types/wallet.types';

export const findWalletByUserId = async (userId: string): Promise<Wallet | null> => {
  const result = await pool.query('SELECT id, user_id, created_at FROM wallets WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
};

export const createWallet = async (userId: string): Promise<Wallet> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletResult = await client.query(
      'INSERT INTO wallets (user_id) VALUES ($1) RETURNING id, user_id, created_at',
      [userId]
    );
    const wallet = walletResult.rows[0];
    // Crear balances para ARS, USD, EUR
    const currencies = ['ARS', 'USD', 'EUR'];
    for (const currency of currencies) {
      await client.query(
        'INSERT INTO balances (wallet_id, currency_code, amount) VALUES ($1, $2, 0)',
        [wallet.id, currency]
      );
    }
    await client.query('COMMIT');
    return wallet;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getBalancesByWalletId = async (walletId: string): Promise<Balance[]> => {
  const result = await pool.query(
    'SELECT currency_code, amount FROM balances WHERE wallet_id = $1 ORDER BY currency_code',
    [walletId]
  );
  return result.rows;
};