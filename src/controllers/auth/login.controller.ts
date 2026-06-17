import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findUserByEmail } from '../../queries/user.queries';
import { verifyPassword } from '../../helpers/password.helpers';
import { AppError } from '../../middleware/error.middleware';
import { respondWithSession } from '../../helpers/auth-response.helpers';

const loginSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(1).max(72),
});

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parsed.data;

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    }

    const passwordHash = user.password_hash;
    if (!passwordHash) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    }

    const passwordMatch = await verifyPassword(password, passwordHash);
    if (!passwordMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    }

    respondWithSession(res, user, 200);
  } catch (err) {
    next(err);
  }
}
