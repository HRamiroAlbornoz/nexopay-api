import { Request, Response } from 'express';

export function logout(_req: Request, res: Response): void {
  res.status(200).json({ message: 'Sesión cerrada correctamente' });
}
