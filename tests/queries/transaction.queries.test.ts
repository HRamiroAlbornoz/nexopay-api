import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  return { mockClient };
});

vi.mock('../../src/db/connection', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn(),
  },
}));

import { executeConversion, executeTransfer } from '../../src/queries/transaction.queries';

describe('executeConversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.release.mockReset();
  });

  it('lanza INSUFFICIENT_BALANCE cuando el saldo es menor al monto requerido', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { currency_code: 'ARS', amount: 50 },
          { currency_code: 'USD', amount: 10 },
        ],
      });

    await expect(
      executeConversion({
        walletId: 'wallet-1',
        type: 'buy',
        currencyFrom: 'ARS',
        currencyTo: 'USD',
        amountFrom: 1000,
        amountTo: 0.95,
        exchangeRate: 0.00095,
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      httpStatus: 422,
    });
  });

  it('ejecuta ROLLBACK cuando falla la validación de saldo', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ currency_code: 'ARS', amount: 50 }],
      });

    await expect(
      executeConversion({
        walletId: 'wallet-1',
        type: 'buy',
        currencyFrom: 'ARS',
        currencyTo: 'USD',
        amountFrom: 1000,
        amountTo: 0.95,
        exchangeRate: 0.00095,
      })
    ).rejects.toThrow();

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('libera el cliente de la pool incluso cuando ocurre un error', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      executeConversion({
        walletId: 'wallet-1',
        type: 'buy',
        currencyFrom: 'ARS',
        currencyTo: 'USD',
        amountFrom: 100,
        amountTo: 0.095,
        exchangeRate: 0.00095,
      })
    ).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('lanza BALANCE_NOT_FOUND cuando el credit UPDATE no afecta ninguna fila', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { currency_code: 'ARS', amount: 5000 },
          { currency_code: 'USD', amount: 10 },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(
      executeConversion({
        walletId: 'wallet-1',
        type: 'buy',
        currencyFrom: 'ARS',
        currencyTo: 'USD',
        amountFrom: 100,
        amountTo: 0.095,
        exchangeRate: 0.00095,
      })
    ).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });
});

describe('executeTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.release.mockReset();
  });

  it('lanza INSUFFICIENT_BALANCE cuando el saldo del remitente es insuficiente', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { wallet_id: 'sender-wallet', amount: 10 },
          { wallet_id: 'recipient-wallet', amount: 500 },
        ],
      });

    await expect(
      executeTransfer({
        senderWalletId: 'sender-wallet',
        recipientWalletId: 'recipient-wallet',
        currencyCode: 'ARS',
        amount: 1000,
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      httpStatus: 422,
    });
  });

  it('ejecuta ROLLBACK cuando falla la validación de saldo en la transferencia', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ wallet_id: 'sender-wallet', amount: 5 }],
      });

    await expect(
      executeTransfer({
        senderWalletId: 'sender-wallet',
        recipientWalletId: 'recipient-wallet',
        currencyCode: 'USD',
        amount: 100,
      })
    ).rejects.toThrow();

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('lanza BALANCE_NOT_FOUND cuando el destinatario no tiene fila de balance', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { wallet_id: 'sender-wallet', amount: 5000 },
          { wallet_id: 'recipient-wallet', amount: 0 },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(
      executeTransfer({
        senderWalletId: 'sender-wallet',
        recipientWalletId: 'recipient-wallet',
        currencyCode: 'ARS',
        amount: 100,
      })
    ).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      httpStatus: 500,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('libera el cliente de la pool incluso cuando ocurre un error', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      executeTransfer({
        senderWalletId: 'sender-wallet',
        recipientWalletId: 'recipient-wallet',
        currencyCode: 'ARS',
        amount: 100,
      })
    ).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});
