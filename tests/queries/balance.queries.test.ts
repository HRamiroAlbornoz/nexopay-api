import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PoolClient } from 'pg';
import { lockBalancesForUpdate, debitBalance, creditBalance } from '../../src/queries/balance.queries';

function mockClient(): PoolClient {
  return { query: vi.fn() } as unknown as PoolClient;
}

describe('lockBalancesForUpdate', () => {
  it('devuelve un Map con el balance de cada wallet', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({
      rows: [
        { wallet_id: 'wallet-a', amount: 100 },
        { wallet_id: 'wallet-b', amount: 50 },
      ],
    } as never);

    const balances = await lockBalancesForUpdate(client, 'wallet-a', 'wallet-b', 'ARS');

    expect(balances.get('wallet-a')).toBe(100);
    expect(balances.get('wallet-b')).toBe(50);
  });

  it('no incluye una wallet si no tiene fila de balance para esa moneda', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({ rows: [{ wallet_id: 'wallet-a', amount: 100 }] } as never);

    const balances = await lockBalancesForUpdate(client, 'wallet-a', 'wallet-b', 'ARS');

    expect(balances.has('wallet-b')).toBe(false);
  });
});

describe('debitBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no lanza error cuando el UPDATE afecta una fila', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({ rowCount: 1 } as never);

    await expect(debitBalance(client, 'wallet-a', 'ARS', 100)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('amount - $1'), [100, 'wallet-a', 'ARS']);
  });

  it('lanza BALANCE_NOT_FOUND cuando el UPDATE no afecta ninguna fila', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({ rowCount: 0 } as never);

    await expect(debitBalance(client, 'wallet-a', 'ARS', 100)).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });
  });
});

describe('creditBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no lanza error cuando el UPDATE afecta una fila', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({ rowCount: 1 } as never);

    await expect(creditBalance(client, 'wallet-a', 'ARS', 100)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('amount + $1'), [100, 'wallet-a', 'ARS']);
  });

  it('lanza BALANCE_NOT_FOUND cuando el UPDATE no afecta ninguna fila', async () => {
    const client = mockClient();
    vi.mocked(client.query).mockResolvedValueOnce({ rowCount: 0 } as never);

    await expect(creditBalance(client, 'wallet-a', 'ARS', 100)).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });
  });
});
