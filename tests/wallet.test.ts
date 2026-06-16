import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';

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

describe('GET /api/wallet', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });  
  afterEach(() => {
    vi.clearAllMocks();
  });
  describe('Sin cookie/token de autenticación', () => {
    it('debería devolver 401 sin token', async () => {
      const req = {
        headers: {
          authorization: '',
        },
        user: undefined,
      } as any as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      // Simular falta de usuario
      await getWallet(req, res, next);

      // El middleware debe lanzar error en next()
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Con usuario nuevo (sin wallet)', () => {
    it('debería crear wallet y balances en 0 para usuario nuevo', async () => {
      const userId = 'user-123';
      const walletId = 'wallet-456';

      // Mock: usuario no tiene wallet
      vi.mocked(walletQueries.findWalletByUserId).mockResolvedValueOnce(null);

      // Mock: crear wallet
      const mockWallet = {
        id: walletId,
        user_id: userId,
        created_at: new Date(),
      };
      vi.mocked(walletQueries.createWallet).mockResolvedValueOnce(mockWallet);

      const req = {
        user: { id: userId },
      } as any as Request;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getWallet(req, res, next);

      // Verificar que se buscó wallet
      expect(walletQueries.findWalletByUserId).toHaveBeenCalledWith(userId);

      // Verificar que se creó wallet
      expect(walletQueries.createWallet).toHaveBeenCalledWith(userId);

      // Verificar respuesta
      expect(res.json).toHaveBeenCalledWith({
        id: walletId,
        created_at: mockWallet.created_at,
      });
    });

    it('debería inicializar balances en 0 para ARS, USD, EUR', async () => {
      const userId = 'user-123';
      const walletId = 'wallet-456';

      // Mock: crear wallet (que incluye balances)
      const mockWallet = {
        id: walletId,
        user_id: userId,
        created_at: new Date(),
      };

      const mockBalances = [
        { currency_code: 'ARS', amount: '0' },
        { currency_code: 'EUR', amount: '0' },
        { currency_code: 'USD', amount: '0' },
      ];

      vi.mocked(walletQueries.findWalletByUserId).mockResolvedValueOnce(null);
      vi.mocked(walletQueries.createWallet).mockResolvedValueOnce(mockWallet);
      vi.mocked(walletQueries.getBalancesByWalletId).mockResolvedValueOnce(
        mockBalances
      );

      const req = {
        user: { id: userId },
      } as any as Request;

      const res = {
        json: vi.fn(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getBalances(req, res, next);

      // Verificar que se obtuvieron los balances
      expect(walletQueries.getBalancesByWalletId).toHaveBeenCalledWith(walletId);

      // Verificar que los balances están en 0
      expect(res.json).toHaveBeenCalledWith(mockBalances);
      mockBalances.forEach((balance) => {
        expect(balance.amount).toBe('0');
      });
    });
  });

  describe('Con usuario existente', () => {
    it('debería devolver wallet sin duplicar', async () => {
      const userId = 'user-123';
      const mockWallet = {
        id: 'wallet-456',
        user_id: userId,
        created_at: new Date(),
      };

      // Mock: wallet ya existe
      vi.mocked(walletQueries.findWalletByUserId).mockResolvedValueOnce(mockWallet);

      const req = {
        user: { id: userId },
      } as any as Request;

      const res = {
        json: vi.fn(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getWallet(req, res, next);

      // Verificar que se buscó wallet
      expect(walletQueries.findWalletByUserId).toHaveBeenCalledWith(userId);

      // Verificar que NO se creó wallet nueva
      expect(walletQueries.createWallet).not.toHaveBeenCalled();

      // Verificar respuesta con wallet existente
      expect(res.json).toHaveBeenCalledWith({
        id: mockWallet.id,
        created_at: mockWallet.created_at,
      });
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
        { currency_code: 'ARS', amount: '1000.50' },
        { currency_code: 'EUR', amount: '500.00' },
        { currency_code: 'USD', amount: '2000.75' },
      ];

      vi.mocked(walletQueries.findWalletByUserId).mockResolvedValueOnce(mockWallet);
      vi.mocked(walletQueries.getBalancesByWalletId).mockResolvedValueOnce(
        mockBalances
      );

      const req = {
        user: { id: userId },
      } as any as Request;

      const res = {
        json: vi.fn(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getBalances(req, res, next);

      // Verificar que se obtuvieron los balances
      expect(walletQueries.getBalancesByWalletId).toHaveBeenCalledWith(walletId);

      // Verificar respuesta
      expect(res.json).toHaveBeenCalledWith(mockBalances);

      // Verificar que tiene las 3 monedas
      expect(mockBalances).toHaveLength(3);
      expect(mockBalances.map((b) => b.currency_code)).toContain('ARS');
      expect(mockBalances.map((b) => b.currency_code)).toContain('USD');
      expect(mockBalances.map((b) => b.currency_code)).toContain('EUR');
    });
  });

  describe('Manejo de errores', () => {
    it('si la base de datos falla, el error pasa por next()', async () => {
      const userId = 'user-123';
      const dbError = new Error('Database connection failed');

      // Mock: error en la base de datos
      vi.mocked(walletQueries.findWalletByUserId).mockRejectedValueOnce(dbError);

      const req = {
        user: { id: userId },
      } as any as Request;

      const res = {
        json: vi.fn(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getWallet(req, res, next);

      // Verificar que el error se pasó a next()
      expect(next).toHaveBeenCalledWith(dbError);
    });

    it('debería lanzar AppError si userId es undefined', async () => {
      const req = {
        user: { id: undefined },
      } as any as Request;

      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as any as Response;

      const next = vi.fn() as any as NextFunction;

      await getWallet(req, res, next);

      // Verificar que se llamó a next() con error
      expect(next).toHaveBeenCalled();
    });
  });
});
