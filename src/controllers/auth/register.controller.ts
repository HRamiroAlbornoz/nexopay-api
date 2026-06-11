import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findUserByEmail, createUser } from '../../queries/user.queries';
import { createWallet, createInitialBalances } from '../../queries/wallet.queries';
import { hashPassword } from '../../helpers/password.helpers';
import { signToken } from '../../helpers/jwt.helpers';
import { AppError } from '../../middleware/error.middleware';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../../config/cookie';

const registerSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar los 72 caracteres'),
  first_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  last_name: z.string().min(2, 'El apellido debe tener al menos 2 caracteres').max(100),
});

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password, first_name, last_name } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email', 409);
    }

    const password_hash = await hashPassword(password);

    const user = await createUser({ email: normalizedEmail, password_hash, first_name, last_name });
    const wallet = await createWallet(user.id);
    await createInitialBalances(wallet.id);

    const token = signToken({ id: user.id, email: user.email });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.status(201).json({
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
