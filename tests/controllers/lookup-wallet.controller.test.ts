import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../src/queries/wallet.queries');

import { lookupWallet } from '../../src/controllers/wallet/lookup-wallet.controller';
import * as walletQueries from '../../src/queries/wallet.queries';

function mockRequest(email: string, userEmail = 'persona@nexopay.com'): Request {
  return {
    query: { email },
    user: { id: 'user-1', email: userEmail },
  } as unknown as Request;
}

function mockResponse(): Response {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;
}

const mockWallet = {
  id: 'wallet-2',
  user_id: 'user-2',
  created_at: new Date(),
  first_name: 'Richard',
  last_name: 'González',
};

describe('lookupWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve wallet_id, first_name y last_name cuando la cuenta existe', async () => {
    vi.mocked(walletQueries.findWalletByUserEmail).mockResolvedValueOnce(mockWallet);

    const req = mockRequest('richard@nexopay.com');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await lookupWallet(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      wallet_id: 'wallet-2',
      first_name: 'Richard',
      last_name: 'González',
    });
  });

  it('lanza RECIPIENT_NOT_FOUND cuando no existe ninguna cuenta con ese email', async () => {
    vi.mocked(walletQueries.findWalletByUserEmail).mockResolvedValueOnce(null);

    const req = mockRequest('nadie@nexopay.com');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await lookupWallet(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'RECIPIENT_NOT_FOUND', httpStatus: 404 }));
  });

  it('lanza CANNOT_SHARE_WITH_SELF si el email es el del propio usuario', async () => {
    const req = mockRequest('persona@nexopay.com', 'persona@nexopay.com');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await lookupWallet(req, res, next);

    expect(walletQueries.findWalletByUserEmail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CANNOT_SHARE_WITH_SELF', httpStatus: 422 }));
  });

  it('detecta el self-share sin importar mayúsculas/minúsculas', async () => {
    const req = mockRequest('Persona@NexoPay.com', 'persona@nexopay.com');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await lookupWallet(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CANNOT_SHARE_WITH_SELF' }));
  });

  it('rechaza con VALIDATION_ERROR si el email tiene formato inválido', async () => {
    const req = mockRequest('no-es-un-email');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await lookupWallet(req, res, next);

    expect(walletQueries.findWalletByUserEmail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
