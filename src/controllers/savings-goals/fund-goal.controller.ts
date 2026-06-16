import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { getGoalById, updateGoalCurrentAmount, updateGoalStatus } from '../../queries/savings-goal.queries';
import { executeSavingsGoalFunding } from '../../queries/transaction.queries';
import { AppError } from '../../middleware/error.middleware';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const fundSchema = z.object({
  amount: z.number().positive(),
});

export async function fundGoalController(req: Request, res: Response, next: NextFunction) {
  try {
    const paramsParsed = paramsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      next(paramsParsed.error);
      return;
    }
    const { id: goalId } = paramsParsed.data;

    const bodyParsed = fundSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      next(bodyParsed.error);
      return;
    }
    const { amount } = bodyParsed.data;

    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }

    const goal = await getGoalById(goalId);
    if (!goal) {
      throw new AppError('GOAL_NOT_FOUND', 'Meta no encontrada', 404);
    }
    if (goal.wallet_id !== wallet.id) {
      throw new AppError('FORBIDDEN', 'No tienes permiso para fondear esta meta', 403);
    }
    if (goal.status !== 'active') {
      throw new AppError('GOAL_NOT_ACTIVE', 'La meta no está activa', 422);
    }

    const newCurrent = goal.current_amount + amount;
    if (newCurrent > goal.target_amount) {
      throw new AppError('EXCEEDS_TARGET', 'El monto excede el objetivo', 422, {
        available_to_fund: goal.target_amount - goal.current_amount,
      });
    }

    const transaction = await executeSavingsGoalFunding(
      wallet.id,
      goalId,
      goal.currency_code as any,
      amount
    );

    await updateGoalCurrentAmount(goalId, newCurrent);

    if (newCurrent >= goal.target_amount) {
      await updateGoalStatus(goalId, 'completed');
    }

    res.status(200).json({
      transaction,
      goal: { ...goal, current_amount: newCurrent },
      funded: amount,
      remaining: goal.target_amount - newCurrent,
    });
  } catch (err) {
    next(err);
  }
}