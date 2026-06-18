import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow, getBalanceHistoryByWalletId } from '../../queries/wallet.queries';

const MAX_DAYS = 90;

const querySchema = z.object({
  days: z.coerce.number().int().positive().max(MAX_DAYS).default(7),
});

export async function getBalanceHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);
    const history = await getBalanceHistoryByWalletId(wallet.id, parsed.data.days);

    res.status(200).json({ history });
  } catch (err) {
    next(err);
  }
}
