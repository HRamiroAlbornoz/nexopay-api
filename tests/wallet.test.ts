import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../src/middleware/error.middleware';

// Mock de la conexión antes de importar
vi.mock('../src/db/connection', () => ({
  default: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock de las queries
vi.mock('../src/queries/wallet.queries');

import { getWallet, getBalances } from '../src/controllers/wallet/get-wallet.controller';
import * as walletQueries from '../src/queries/wallet.queries';

// Mockear Request/Response completos es impracticable en un test unitario;
// 'unknown' evita 'any' y solo se castea lo necesario para satisfacer al controller.
function mockRequest(userId: string): Request {
  return { user: { id: userId, email: 'test@nexopay.com' } } as unknown as Request;
}

function mockResponse(): Response {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;
}

describe('GET /api/wallet', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Con usuario existente', () => {
    it('debería devolver la wallet existente', async () => {
      const userId = 'user-123';
      const mockWallet = {
        id: 'wallet-456',
        user_id: userId,
        created_at: new Date(),
      };

      vi.mocked(walletQueries.findWalletByUserIdOrThrow).mockResolvedValueOnce(mockWallet);

      const req = mockRequest(userId);
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      await getWallet(req, res, next);

      expect(walletQueries.findWalletByUserIdOrThrow).toHaveBeenCalledWith(userId);
      expect(res.json).toHaveBeenCalledWith({
        id: mockWallet.id,
        created_at: mockWallet.created_at,
      });
    });

    it('debería lanzar WALLET_NOT_FOUND si el usuario no tiene wallet', async () => {
      const userId = 'user-123';
      const notFoundError = new AppError('WALLET_NOT_FOUND', 'No se encontró una wallet para este usuario', 404);

      vi.mocked(walletQueries.findWalletByUserIdOrThrow).mockRejectedValueOnce(notFoundError);

      const req = mockRequest(userId);
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      await getWallet(req, res, next);

      expect(next).toHaveBeenCalledWith(notFoundError);
    });
  });

  describe('GET /api/wallet/balances', () => {
    it('debería devolver array con ARS, USD, EUR', async () => {
      const userId = 'user-123';
      const walletId = 'wallet-456';
      const mockWallet = {
        id: walletId,
        user_id: userId,
        created_at: new Date(),
      };

      const mockBalances = [
        { currency_code: 'ARS', amount: 1000.5 },
        { currency_code: 'EUR', amount: 500 },
        { currency_code: 'USD', amount: 2000.75 },
      ];

      vi.mocked(walletQueries.findWalletByUserIdOrThrow).mockResolvedValueOnce(mockWallet);
      vi.mocked(walletQueries.getBalancesByWalletId).mockResolvedValueOnce(mockBalances);

      const req = mockRequest(userId);
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      await getBalances(req, res, next);

      expect(walletQueries.getBalancesByWalletId).toHaveBeenCalledWith(walletId);
      expect(res.json).toHaveBeenCalledWith(mockBalances);
      expect(mockBalances.map((b) => b.currency_code)).toEqual(['ARS', 'EUR', 'USD']);
      mockBalances.forEach((balance) => {
        expect(typeof balance.amount).toBe('number');
      });
    });

    it('debería lanzar WALLET_NOT_FOUND si el usuario no tiene wallet', async () => {
      const userId = 'user-123';
      const notFoundError = new AppError('WALLET_NOT_FOUND', 'No se encontró una wallet para este usuario', 404);

      vi.mocked(walletQueries.findWalletByUserIdOrThrow).mockRejectedValueOnce(notFoundError);

      const req = mockRequest(userId);
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      await getBalances(req, res, next);

      expect(walletQueries.getBalancesByWalletId).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(notFoundError);
    });
  });

  describe('Manejo de errores', () => {
    it('si la base de datos falla, el error pasa por next()', async () => {
      const userId = 'user-123';
      const dbError = new Error('Database connection failed');

      vi.mocked(walletQueries.findWalletByUserIdOrThrow).mockRejectedValueOnce(dbError);

      const req = mockRequest(userId);
      const res = mockResponse();
      const next = vi.fn() as unknown as NextFunction;

      await getWallet(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
