import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { fundSavingsGoal } from '../../queries/savings-goal.queries';

const fundGoalSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
});

export async function fundGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = fundGoalSchema.safeParse({ ...req.params, ...req.body });

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const { goal, transaction } = await fundSavingsGoal(parsed.data.id, wallet.id, parsed.data.amount);

    res.status(200).json({ goal, transaction });
  } catch (err) {
    next(err);
  }
}
