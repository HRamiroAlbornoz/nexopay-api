import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserEmail } from '../../queries/wallet.queries';
import { AppError } from '../../middleware/error.middleware';

const querySchema = z.object({
  email: z.string().email('Email inválido'),
});

export async function lookupWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { email } = parsed.data;

    if (email.toLowerCase() === req.user!.email.toLowerCase()) {
      throw new AppError('CANNOT_SHARE_WITH_SELF', 'No podés compartir un gasto con vos mismo', 422);
    }

    const wallet = await findWalletByUserEmail(email);
    if (!wallet) {
      throw new AppError('RECIPIENT_NOT_FOUND', 'No existe una cuenta con ese email', 404);
    }

    res.status(200).json({
      wallet_id: wallet.id,
      first_name: wallet.first_name,
      last_name: wallet.last_name,
    });
  } catch (err) {
    next(err);
  }
}
