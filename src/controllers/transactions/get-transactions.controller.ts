import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { getTransactionsByWalletId } from '../../queries/transaction.queries';
import { AppError } from '../../middleware/error.middleware';

const MAX_LIMIT = 100;

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(20),
});

export async function getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Wallet no encontrada', 404);
    }

    const transactions = await getTransactionsByWalletId(wallet.id, limit, offset);

    res.status(200).json({ transactions, page, limit });
  } catch (err) {
    next(err);
  }
}
