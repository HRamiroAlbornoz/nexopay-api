import { Request, Response, NextFunction } from 'express';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { getExpensesByWalletId } from '../../queries/shared-expense.queries';
import { AppError } from '../../middleware/error.middleware';

export async function getExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }
    const expenses = await getExpensesByWalletId(wallet.id);
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
}