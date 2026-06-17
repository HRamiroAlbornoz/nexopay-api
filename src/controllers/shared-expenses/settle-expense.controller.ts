import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserId } from '../../queries/wallet.queries';
import { 
  getExpenseById, 
  getMemberByExpenseAndWallet, 
  updateMemberPaidAmount,
  checkAndUpdateExpenseStatus 
} from '../../queries/shared-expense.queries';
import { executeSharedExpenseSettlement } from '../../queries/transaction.queries';
import { AppError } from '../../middleware/error.middleware';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function settleExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const paramsParsed = paramsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      next(paramsParsed.error);
      return;
    }
    const { id: expenseId } = paramsParsed.data;

    const payerWallet = await findWalletByUserId(req.user!.id);
    if (!payerWallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Usuario sin wallet', 404);
    }

    const expense = await getExpenseById(expenseId);
    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', 'Gasto no encontrado', 404);
    }

    const member = await getMemberByExpenseAndWallet(expenseId, payerWallet.id);
    if (!member) {
      throw new AppError('NOT_MEMBER', 'No eres miembro de este gasto', 403);
    }

    const remaining = member.amount_owed - member.amount_paid;
    if (remaining <= 0) {
      throw new AppError('ALREADY_PAID', 'Ya has pagado tu parte', 422);
    }

    const recipientWalletId = expense.created_by_wallet_id;
    const transaction = await executeSharedExpenseSettlement(
      payerWallet.id,
      recipientWalletId,
      expenseId,
      expense.currency_code as any,
      remaining
    );

    const newPaidAmount = member.amount_paid + remaining;
    await updateMemberPaidAmount(member.id, newPaidAmount);
    await checkAndUpdateExpenseStatus(expenseId);

    res.status(200).json({ transaction, paid: remaining, total_paid: newPaidAmount });
  } catch (err) {
    next(err);
  }
}