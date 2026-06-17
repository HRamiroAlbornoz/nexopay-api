import { Request, Response, NextFunction } from 'express';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { getSavingsGoalsByWalletId } from '../../queries/savings-goal.queries';

export async function getGoals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wallet = await findWalletByUserIdOrThrow(req.user!.id);
    const goals = await getSavingsGoalsByWalletId(wallet.id);

    res.status(200).json({ goals });
  } catch (err) {
    next(err);
  }
}
