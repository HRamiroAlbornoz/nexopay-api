import { Request, Response } from 'express';
import { COOKIE_NAME, COOKIE_CLEAR_OPTIONS } from '../../config/cookie';

export function logout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, COOKIE_CLEAR_OPTIONS);
  res.status(200).json({ message: 'Sesión cerrada' });
}
