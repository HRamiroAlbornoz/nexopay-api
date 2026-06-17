import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { createSavingsGoal } from '../../queries/savings-goal.queries';
import { SUPPORTED_CURRENCIES } from '../../types/currency.types';

const MAX_TITLE_LENGTH = 255;

// z.coerce.date() en un string solo-fecha ("2026-06-17") da medianoche UTC. Comparar
// eso contra "ahora" rechazaría "hoy" como pasado durante casi todo el día en timezones
// detrás de UTC (Argentina incluida). Por eso comparamos fecha contra fecha (medianoche
// UTC de hoy), no fecha contra el instante actual.
function isTodayOrFutureUTC(date: Date): boolean {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date >= todayUTC;
}

const createGoalSchema = z
  .object({
    title: z.string().trim().min(1, 'El título no puede estar vacío').max(MAX_TITLE_LENGTH),
    target_amount: z.number().positive(),
    currency_code: z.enum(SUPPORTED_CURRENCIES),
    target_date: z.coerce.date().optional(),
  })
  .refine((data) => !data.target_date || isTodayOrFutureUTC(data.target_date), {
    message: 'La fecha objetivo no puede ser una fecha pasada',
    path: ['target_date'],
  });

export async function createGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createGoalSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { title, target_amount, currency_code, target_date } = parsed.data;

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const goal = await createSavingsGoal({
      walletId: wallet.id,
      title,
      targetAmount: target_amount,
      currencyCode: currency_code,
      targetDate: target_date,
    });

    res.status(201).json({ goal });
  } catch (err) {
    next(err);
  }
}
