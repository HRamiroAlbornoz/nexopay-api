import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findUserByEmail } from '../../queries/user.queries';
import { verifyPassword } from '../../helpers/password.helpers';
import { signToken } from '../../helpers/jwt.helpers';
import { AppError } from '../../middleware/error.middleware';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../../config/cookie';

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

    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    }

    const token = signToken({ id: user.id, email: user.email });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (err) {
    next(err);
  }
}
