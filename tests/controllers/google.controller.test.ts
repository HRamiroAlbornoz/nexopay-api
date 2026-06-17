import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const { mockVerifyIdToken } = vi.hoisted(() => ({ mockVerifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function MockOAuth2Client() {
    return { verifyIdToken: mockVerifyIdToken };
  }),
}));

vi.mock('../../src/queries/user.queries');

import { googleAuth } from '../../src/controllers/auth/google.controller';
import * as userQueries from '../../src/queries/user.queries';

function mockRequest(credential: string): Request {
  return { body: { credential } } as unknown as Request;
}

function mockResponse(): Response {
  return { json: vi.fn(), status: vi.fn().mockReturnThis(), cookie: vi.fn() } as unknown as Response;
}

function mockGooglePayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'google-sub-123',
    email: 'persona@gmail.com',
    email_verified: true,
    given_name: 'Persona',
    family_name: 'Apellido',
    ...overrides,
  };
}

describe('googleAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza INVALID_GOOGLE_TOKEN si el token no es válido', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('token expirado'));

    const req = mockRequest('token-invalido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_GOOGLE_TOKEN', httpStatus: 401 }));
  });

  it('loguea directo (200) cuando el google_sub ya existe', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => mockGooglePayload() });
    const existingUser = {
      id: 'user-1',
      email: 'persona@gmail.com',
      password_hash: null,
      google_sub: 'google-sub-123',
      first_name: 'Persona',
      last_name: 'Apellido',
      created_at: new Date(),
      updated_at: new Date(),
    };
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(existingUser);

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(userQueries.findUserByEmail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalled();
  });

  it('vincula la cuenta existente por email cuando email_verified es true (200)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => mockGooglePayload() });
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(null);

    const existingUser = {
      id: 'user-2',
      email: 'persona@gmail.com',
      password_hash: 'hash-existente',
      google_sub: null,
      first_name: 'Persona',
      last_name: 'Apellido',
      created_at: new Date(),
      updated_at: new Date(),
    };
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce(existingUser);
    vi.mocked(userQueries.linkGoogleSubToUser).mockResolvedValueOnce({
      ...existingUser,
      google_sub: 'google-sub-123',
    });

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(userQueries.linkGoogleSubToUser).toHaveBeenCalledWith('user-2', 'google-sub-123');
    expect(userQueries.createUserWithWallet).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lanza USER_NOT_FOUND si la cuenta desaparece entre la lectura y la vinculación', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => mockGooglePayload() });
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(null);
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce({
      id: 'user-2',
      email: 'persona@gmail.com',
      password_hash: 'hash-existente',
      google_sub: null,
      first_name: 'Persona',
      last_name: 'Apellido',
      created_at: new Date(),
      updated_at: new Date(),
    });
    vi.mocked(userQueries.linkGoogleSubToUser).mockResolvedValueOnce(null);

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_NOT_FOUND', httpStatus: 404 }));
  });

  it('lanza GOOGLE_EMAIL_NOT_VERIFIED y no vincula si email_verified es false', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => mockGooglePayload({ email_verified: false }) });
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(null);
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce({
      id: 'user-2',
      email: 'persona@gmail.com',
      password_hash: 'hash-existente',
      google_sub: null,
      first_name: 'Persona',
      last_name: 'Apellido',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(userQueries.linkGoogleSubToUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GOOGLE_EMAIL_NOT_VERIFIED', httpStatus: 403 })
    );
  });

  it('crea una cuenta nueva sin contraseña cuando no existe ni por google_sub ni por email (201)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => mockGooglePayload() });
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(null);
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce(null);

    const newUser = {
      id: 'user-3',
      email: 'persona@gmail.com',
      password_hash: null,
      google_sub: 'google-sub-123',
      first_name: 'Persona',
      last_name: 'Apellido',
      created_at: new Date(),
      updated_at: new Date(),
    };
    vi.mocked(userQueries.createUserWithWallet).mockResolvedValueOnce({
      user: newUser,
      wallet: { id: 'wallet-3', user_id: 'user-3', created_at: new Date() },
    });

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(userQueries.createUserWithWallet).toHaveBeenCalledWith({
      email: 'persona@gmail.com',
      password_hash: null,
      first_name: 'Persona',
      last_name: 'Apellido',
      google_sub: 'google-sub-123',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('usa el primer nombre de "name" si no viene given_name', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () =>
        mockGooglePayload({ given_name: undefined, family_name: undefined, name: 'Nombre Completo' }),
    });
    vi.mocked(userQueries.findUserByGoogleSub).mockResolvedValueOnce(null);
    vi.mocked(userQueries.findUserByEmail).mockResolvedValueOnce(null);
    vi.mocked(userQueries.createUserWithWallet).mockResolvedValueOnce({
      user: {
        id: 'user-4',
        email: 'persona@gmail.com',
        password_hash: null,
        google_sub: 'google-sub-123',
        first_name: 'Nombre',
        last_name: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      wallet: { id: 'wallet-4', user_id: 'user-4', created_at: new Date() },
    });

    const req = mockRequest('token-valido');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(userQueries.createUserWithWallet).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Nombre', last_name: null })
    );
  });

  it('rechaza con VALIDATION_ERROR si falta el credential', async () => {
    const req = { body: {} } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await googleAuth(req, res, next);

    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
