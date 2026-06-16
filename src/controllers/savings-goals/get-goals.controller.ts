import { Request, Response, NextFunction } from 'express';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { getGoalsByWalletId } from '../../queries/savings-goal.queries';
import { AppError } from '../../middleware/error.middleware';

export async function getGoalsController(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }
    const goals = await getGoalsByWalletId(wallet.id);
    res.json({ goals });
  } catch (err) {
    next(err);
  }
}