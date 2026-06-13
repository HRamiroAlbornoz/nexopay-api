import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findUserByEmail, createUser } from '../../queries/user.queries';
import { createWallet } from '../../queries/wallet.queries';
import { hashPassword } from '../../helpers/password.helpers';
import { signToken } from '../../helpers/jwt.helpers';
import { AppError } from '../../middleware/error.middleware';

const registerSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar los 72 caracteres'),
  full_name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(255),
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

    const { email, password, full_name } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email', 409);
    }

    const password_hash = await hashPassword(password);

    const user = await createUser({ email: normalizedEmail, password_hash, full_name });
    const wallet = await createWallet(user.id);

    const token = signToken({ id: user.id, email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
    });
  } catch (err) {
    next(err);
  }
}
