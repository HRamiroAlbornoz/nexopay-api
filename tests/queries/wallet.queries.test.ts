import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { createWallet, findWalletByUserIdOrThrow } from '../../src/queries/wallet.queries';
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
