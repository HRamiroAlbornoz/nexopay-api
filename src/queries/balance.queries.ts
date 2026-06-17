import { PoolClient } from 'pg';
import { AppError } from '../middleware/error.middleware';

// Bloquea los balances de dos wallets para la misma moneda, en orden canónico
// (wallet_id alfabético) para evitar deadlocks entre operaciones concurrentes
// que tocan el mismo par de wallets (transferencias mutuas, liquidaciones, etc.).
export async function lockBalancesForUpdate(
  client: PoolClient,
  walletIdA: string,
  walletIdB: string,
  currencyCode: string
): Promise<Map<string, number>> {
  const result = await client.query<{ wallet_id: string; amount: number }>(
    `SELECT wallet_id, amount::float8 AS amount FROM balances
     WHERE wallet_id IN ($1, $2) AND currency_code = $3
     ORDER BY wallet_id
     FOR UPDATE`,
    [walletIdA, walletIdB, currencyCode]
  );

  return new Map(result.rows.map((row) => [row.wallet_id, row.amount]));
}

export async function debitBalance(
  client: PoolClient,
  walletId: string,
  currencyCode: string,
  amount: number
): Promise<void> {
  const result = await client.query(
    `UPDATE balances SET amount = amount - $1 WHERE wallet_id = $2 AND currency_code = $3`,
    [amount, walletId, currencyCode]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('BALANCE_NOT_FOUND', 'El balance de la wallet no existe', 500, {
      walletId,
      currency: currencyCode,
    });
  }
}

export async function creditBalance(
  client: PoolClient,
  walletId: string,
  currencyCode: string,
  amount: number
): Promise<void> {
  const result = await client.query(
    `UPDATE balances SET amount = amount + $1 WHERE wallet_id = $2 AND currency_code = $3`,
    [amount, walletId, currencyCode]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('BALANCE_NOT_FOUND', 'El balance de la wallet no existe', 500, {
      walletId,
      currency: currencyCode,
    });
  }
}
