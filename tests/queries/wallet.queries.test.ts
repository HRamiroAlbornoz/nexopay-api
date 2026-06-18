import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoolClient } from 'pg';

const { mockClient, mockPoolQuery } = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockPoolQuery = vi.fn();
  return { mockClient, mockPoolQuery };
});

vi.mock('../../src/db/connection', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: mockPoolQuery,
  },
}));

import { createWallet, findWalletByUserIdOrThrow, getBalanceHistoryByWalletId } from '../../src/queries/wallet.queries';
import { createUserWithWallet } from '../../src/queries/user.queries';
import { SUPPORTED_CURRENCIES } from '../../src/types/currency.types';

const mockWallet = { id: 'wallet-1', user_id: 'user-1', created_at: new Date() };
const mockUser = {
  id: 'user-1',
  email: 'test@nexopay.com',
  password_hash: 'hash',
  first_name: 'Test',
  last_name: 'User',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('createWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('siembra un balance en 0 para cada moneda soportada', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockWallet] }) // INSERT wallets
      .mockResolvedValueOnce(undefined) // INSERT balances
      .mockResolvedValueOnce(undefined); // COMMIT

    await createWallet('user-1');

    const balancesCall = mockClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO balances')
    );
    expect(balancesCall).toBeDefined();
    const [, params] = balancesCall!;
    expect(params).toEqual([mockWallet.id, ...SUPPORTED_CURRENCIES]);
  });

  it('hace ROLLBACK y libera el cliente si falla la inserción de balances', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockWallet] }) // INSERT wallets
      .mockRejectedValueOnce(new Error('insert balances failed'));

    await expect(createWallet('user-1')).rejects.toThrow('insert balances failed');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('no inicia ni cierra su propia transacción cuando recibe un client externo', async () => {
    // El client mockeado solo necesita query/release; el resto de PoolClient no se usa en esta función.
    const externalClient = { query: vi.fn(), release: vi.fn() } as unknown as PoolClient;
    vi.mocked(externalClient.query)
      .mockResolvedValueOnce({ rows: [mockWallet] } as never)
      .mockResolvedValueOnce(undefined as never);

    await createWallet('user-1', externalClient);

    expect(externalClient.query).not.toHaveBeenCalledWith('BEGIN');
    expect(externalClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(externalClient.release).not.toHaveBeenCalled();
  });
});

describe('findWalletByUserIdOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna la wallet cuando existe', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockWallet] });

    const wallet = await findWalletByUserIdOrThrow('user-1');

    expect(wallet).toEqual(mockWallet);
  });

  it('lanza WALLET_NOT_FOUND cuando no existe', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await expect(findWalletByUserIdOrThrow('user-1')).rejects.toMatchObject({
      code: 'WALLET_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('createUserWithWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea el usuario y la wallet en una sola transacción', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT users
      .mockResolvedValueOnce({ rows: [mockWallet] }) // INSERT wallets
      .mockResolvedValueOnce(undefined) // INSERT balances
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await createUserWithWallet({
      email: mockUser.email,
      password_hash: mockUser.password_hash,
      first_name: mockUser.first_name,
      last_name: mockUser.last_name,
    });

    expect(result.user.id).toBe(mockUser.id);
    expect(result.wallet.id).toBe(mockWallet.id);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('hace ROLLBACK del usuario si falla la creación de la wallet', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT users
      .mockRejectedValueOnce(new Error('insert wallet failed'));

    await expect(
      createUserWithWallet({
        email: mockUser.email,
        password_hash: mockUser.password_hash,
        first_name: mockUser.first_name,
        last_name: mockUser.last_name,
      })
    ).rejects.toThrow('insert wallet failed');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

describe('getBalanceHistoryByWalletId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin transacciones, devuelve un punto por día en 0 para cada moneda', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const history = await getBalanceHistoryByWalletId('wallet-1', 3);

    expect(history).toEqual([
      { date: '2026-06-16', ARS: 0, USD: 0, EUR: 0 },
      { date: '2026-06-17', ARS: 0, USD: 0, EUR: 0 },
      { date: '2026-06-18', ARS: 0, USD: 0, EUR: 0 },
    ]);
  });

  it('aplica correctamente los 8 tipos de transacción y arrastra el balance en días sin movimientos', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        // Antes del rango pedido (days=3, hoy es 2026-06-18) — forma el balance base.
        {
          type: 'transfer_in',
          currency_from: 'ARS',
          currency_to: 'ARS',
          amount_from: 5000,
          amount_to: 5000,
          created_at: new Date('2026-06-10T10:00:00.000Z'),
        },
        // 2026-06-16: único movimiento de ese día.
        {
          type: 'buy',
          currency_from: 'ARS',
          currency_to: 'USD',
          amount_from: 1000,
          amount_to: 1,
          created_at: new Date('2026-06-16T09:00:00.000Z'),
        },
        // 2026-06-17 no tiene transacciones — debe arrastrar el balance de 2026-06-16.
        // 2026-06-18: el resto de los tipos, en orden.
        {
          type: 'savings_goal_fund',
          currency_from: 'ARS',
          currency_to: 'ARS',
          amount_from: 200,
          amount_to: 200,
          created_at: new Date('2026-06-18T08:00:00.000Z'),
        },
        {
          type: 'shared_expense_received',
          currency_from: 'EUR',
          currency_to: 'EUR',
          amount_from: 50,
          amount_to: 50,
          created_at: new Date('2026-06-18T09:00:00.000Z'),
        },
        {
          type: 'sell',
          currency_from: 'USD',
          currency_to: 'ARS',
          amount_from: 1,
          amount_to: 1000,
          created_at: new Date('2026-06-18T10:00:00.000Z'),
        },
        {
          type: 'exchange',
          currency_from: 'EUR',
          currency_to: 'USD',
          amount_from: 50,
          amount_to: 0.1,
          created_at: new Date('2026-06-18T11:00:00.000Z'),
        },
        {
          type: 'transfer_out',
          currency_from: 'ARS',
          currency_to: 'ARS',
          amount_from: 100,
          amount_to: 100,
          created_at: new Date('2026-06-18T11:30:00.000Z'),
        },
        {
          type: 'shared_expense_paid',
          currency_from: 'ARS',
          currency_to: 'ARS',
          amount_from: 200,
          amount_to: 200,
          created_at: new Date('2026-06-18T12:00:00.000Z'),
        },
      ],
    });

    const history = await getBalanceHistoryByWalletId('wallet-1', 3);

    expect(history).toEqual([
      { date: '2026-06-16', ARS: 4000, USD: 1, EUR: 0 },
      { date: '2026-06-17', ARS: 4000, USD: 1, EUR: 0 }, // arrastrado, sin movimientos ese día
      { date: '2026-06-18', ARS: 4500, USD: 0.1, EUR: 0 },
    ]);
  });

  it('respeta la cantidad de días pedida', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const history = await getBalanceHistoryByWalletId('wallet-1', 7);

    expect(history).toHaveLength(7);
    expect(history[0].date).toBe('2026-06-12');
    expect(history[6].date).toBe('2026-06-18');
  });
});
