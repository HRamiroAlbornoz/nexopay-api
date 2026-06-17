import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { settleExpenseMember } from '../../queries/shared-expense.queries';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function settleExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = paramsSchema.safeParse(req.params);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const { expense, transaction } = await settleExpenseMember(parsed.data.id, wallet.id);

    res.status(200).json({ expense, transaction });
  } catch (err) {
    next(err);
  }
}
