import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { createExpenseWithMembers } from '../../queries/shared-expense.queries';
import { AppError } from '../../middleware/error.middleware';
import { SUPPORTED_CURRENCIES, FLOAT_EPSILON } from '../../types/currency.types';

const MAX_TITLE_LENGTH = 255;

const memberSchema = z.object({
  wallet_id: z.string().uuid(),
  amount_owed: z.number().positive(),
});

const createExpenseSchema = z
  .object({
    title: z.string().trim().min(1, 'El título no puede estar vacío').max(MAX_TITLE_LENGTH),
    total_amount: z.number().positive(),
    currency_code: z.enum(SUPPORTED_CURRENCIES),
    members: z.array(memberSchema).min(1, 'Debe haber al menos un miembro'),
  })
  .superRefine((data, ctx) => {
    const walletIds = data.members.map((m) => m.wallet_id);
    if (new Set(walletIds).size !== walletIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se puede repetir la misma wallet entre los miembros',
        path: ['members'],
      });
    }

    const sum = data.members.reduce((acc, m) => acc + m.amount_owed, 0);
    if (Math.abs(sum - data.total_amount) > FLOAT_EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La suma de las partes no coincide con el total',
        path: ['members'],
      });
    }
  });

export async function createExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createExpenseSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { title, total_amount, currency_code, members } = parsed.data;

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const creatorIncluded = members.some((m) => m.wallet_id === wallet.id);
    if (!creatorIncluded) {
      throw new AppError('CREATOR_NOT_MEMBER', 'Tenés que incluirte como miembro con tu parte', 422);
    }

    const expense = await createExpenseWithMembers({
      creatorWalletId: wallet.id,
      title,
      totalAmount: total_amount,
      currencyCode: currency_code,
      members: members.map((m) => ({ walletId: m.wallet_id, amountOwed: m.amount_owed })),
    });

    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
}
