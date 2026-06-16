import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow, findWalletByUserEmail } from '../../queries/wallet.queries';
import { executeTransfer } from '../../queries/transaction.queries';
import { AppError } from '../../middleware/error.middleware';
import { SUPPORTED_CURRENCIES } from '../../types/currency.types';

const transferSchema = z.object({
  recipient_email: z.string().email(),
  currency_code: z.enum(SUPPORTED_CURRENCIES),
  amount: z.number().positive(),
});

export async function transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = transferSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { recipient_email, currency_code, amount } = parsed.data;

    const senderWallet = await findWalletByUserIdOrThrow(req.user!.id);

    const recipientWallet = await findWalletByUserEmail(recipient_email);
    if (!recipientWallet) {
      throw new AppError('RECIPIENT_NOT_FOUND', 'El destinatario no existe', 404);
    }

    if (senderWallet.id === recipientWallet.id) {
      throw new AppError('INVALID_TRANSFER', 'No podés transferirte a vos mismo', 422);
    }

    const transaction = await executeTransfer({
      senderWalletId: senderWallet.id,
      recipientWalletId: recipientWallet.id,
      currencyCode: currency_code,
      amount,
    });

    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}
