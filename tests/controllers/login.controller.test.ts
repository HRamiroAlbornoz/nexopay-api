import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../src/queries/user.queries');
vi.mock('../../src/helpers/password.helpers');

import { login } from '../../src/controllers/auth/login.controller';
import * as userQueries from '../../src/queries/user.queries';
import * as passwordHelpers from '../../src/helpers/password.helpers';

function mockRequest(email: string, password: string): Request {
  return { body: { email, password } } as unknown as Request;
}

function mockResponse(): Response {
  return { json: vi.fn(), status: vi.fn().mockReturnThis(), cookie: vi.fn() } as unknown as Response;
}

const baseUser = {
  id: 'user-1',
  email: 'persona@nexopay.com',
  google_sub: null,
  first_name: 'Persona',
  last_name: 'Apellido',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loguea con contraseña correcta', async () => {
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce({ ...baseUser, password_hash: 'hash-real' });
    vi.mocked(passwordHelpers.verifyPassword).mockResolvedValueOnce(true);

    const req = mockRequest('persona@nexopay.com', 'Test1234');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalled();
  });

  it('lanza INVALID_CREDENTIALS si el email no existe', async () => {
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce(null);

    const req = mockRequest('nadie@nexopay.com', 'Test1234');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await login(req, res, next);

    expect(passwordHelpers.verifyPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_CREDENTIALS', httpStatus: 401 }));
  });

  it('lanza INVALID_CREDENTIALS si la contraseña es incorrecta', async () => {
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce({ ...baseUser, password_hash: 'hash-real' });
    vi.mocked(passwordHelpers.verifyPassword).mockResolvedValueOnce(false);

    const req = mockRequest('persona@nexopay.com', 'contraseña-incorrecta');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_CREDENTIALS', httpStatus: 401 }));
  });

  it('lanza INVALID_CREDENTIALS sin llamar a verifyPassword cuando la cuenta es solo-Google (password_hash null)', async () => {
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce({ ...baseUser, password_hash: null });

    const req = mockRequest('persona@nexopay.com', 'cualquier-cosa');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await login(req, res, next);

    expect(passwordHelpers.verifyPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_CREDENTIALS', httpStatus: 401 }));
  });
});
