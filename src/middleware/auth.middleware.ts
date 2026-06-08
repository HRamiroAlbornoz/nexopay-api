import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../helpers/jwt.helpers';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 'MISSING_TOKEN', message: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token inválido o expirado' });
  }
}
