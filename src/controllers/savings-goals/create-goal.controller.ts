import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { createGoal } from '../../queries/savings-goal.queries';
import { AppError } from '../../middleware/error.middleware';
import { SUPPORTED_CURRENCIES } from '../../types/currency.types';

const createGoalSchema = z.object({
  title: z.string().min(1).max(255),
  target_amount: z.number().positive(),
  currency_code: z.enum(SUPPORTED_CURRENCIES),
  target_date: z.string().datetime().optional(),
});

export async function createGoalController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    const { title, target_amount, currency_code, target_date } = parsed.data;

    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }

    const goal = await createGoal(
      wallet.id,
      title,
      target_amount,
      currency_code,
      target_date ? new Date(target_date) : undefined
    );
    res.status(201).json({ goal });
  } catch (err) {
    next(err);
  }
}