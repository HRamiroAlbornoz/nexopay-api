import { Request, Response, NextFunction } from 'express';
import { findUserById } from '../../queries/user.queries';
import { AppError } from '../../middleware/error.middleware';

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await findUserById(req.user!.id);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      created_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
}
