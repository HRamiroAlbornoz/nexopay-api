import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../helpers/jwt.helpers';
import { COOKIE_NAME } from '../config/cookie';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies[COOKIE_NAME] as string | undefined;

  if (!token) {
    res.status(401).json({ code: 'MISSING_TOKEN', message: 'Token de autenticación requerido' });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token inválido o expirado' });
  }
}
