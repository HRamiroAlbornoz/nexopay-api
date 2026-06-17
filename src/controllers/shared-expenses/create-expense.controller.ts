import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserId } from '../../queries/wallet.queries';
import { createExpenseWithMembers, validateWalletsExist } from '../../queries/shared-expense.queries';
import { AppError } from '../../middleware/error.middleware';

const memberSchema = z.object({
  wallet_id: z.string().uuid(),
  amount_owed: z.number().positive(),
});

const createExpenseSchema = z.object({
  title: z.string().min(1).max(255),
  total_amount: z.number().positive(),
  currency_code: z.string().length(3),
  members: z.array(memberSchema).min(1),
});

export async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    const { title, total_amount, currency_code, members } = parsed.data;

    const wallet = await findWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }

    const creatorIncluded = members.some(m => m.wallet_id === wallet.id);
    if (!creatorIncluded) {
      throw new AppError('CREATOR_NOT_MEMBER', 'El creador debe incluirse como miembro con su parte', 422);
    }

    const allWalletIds = members.map(m => m.wallet_id);
    await validateWalletsExist(allWalletIds);

    const expense = await createExpenseWithMembers(wallet.id, title, total_amount, currency_code, members);
    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
}