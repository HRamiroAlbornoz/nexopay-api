import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { getTransactionsByWalletId } from '../../queries/transaction.queries';

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

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const transactions = await getTransactionsByWalletId(wallet.id, limit, offset);

    res.status(200).json({ transactions, page, limit });
  } catch (err) {
    next(err);
  }
}
