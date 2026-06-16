import jwt from 'jsonwebtoken';
import { env } from '../env';

export interface TokenPayload {
  id: string;
  email: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === 'string') {
    throw new Error('Token inválido');
  }

  return decoded as TokenPayload;
}
