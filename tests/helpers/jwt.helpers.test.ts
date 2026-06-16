import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken, TokenPayload } from '../../src/helpers/jwt.helpers';

const payload: TokenPayload = {
  id: 'user-abc-123',
  email: 'test@nexopay.com',
};

describe('signToken', () => {
  it('retorna un string con formato JWT (3 partes separadas por punto)', () => {
    const token = signToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('el token contiene el id y email correctos', () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.email).toBe(payload.email);
  });

  it('dos tokens distintos para el mismo payload no son iguales (iat difiere)', async () => {
    const token1 = signToken(payload);
    await new Promise((r) => setTimeout(r, 1100));
    const token2 = signToken(payload);
    expect(token1).not.toBe(token2);
  });
});

describe('verifyToken', () => {
  it('retorna el payload correcto para un token válido', () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.email).toBe(payload.email);
  });

  it('lanza error cuando el token es una cadena inválida', () => {
    expect(() => verifyToken('esto.no.es.un.jwt')).toThrow();
  });

  it('lanza error cuando el token fue manipulado', () => {
    const token = signToken(payload);
    const parts = token.split('.');
    const fakePayload = Buffer.from(
      JSON.stringify({ id: 'hacker', email: 'evil@test.com' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;
    expect(() => verifyToken(tamperedToken)).toThrow();
  });

  it('lanza error cuando el token está expirado', () => {
    const expiredToken = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: -1,
    });
    expect(() => verifyToken(expiredToken)).toThrow();
  });

  it('lanza error cuando el token está firmado con un secreto diferente', () => {
    const tokenWrongSecret = jwt.sign(payload, 'otro-secreto-completamente-distinto-32chars');
    expect(() => verifyToken(tokenWrongSecret)).toThrow();
  });
});
