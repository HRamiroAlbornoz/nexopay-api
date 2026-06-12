import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getWalletByUserId } from '../../queries/wallet.queries';
import { executeConversion } from '../../queries/transaction.queries';
import { getRates } from '../../api-calls/frankfurter';
import { convertAmount } from '../../helpers/currency.helpers';
import { AppError } from '../../middleware/error.middleware';

const sellSchema = z.object({
  currency_from: z.enum(['USD', 'EUR']),
  amount_from: z.number().positive(),
});

export async function sell(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sellSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { currency_from, amount_from } = parsed.data;

    const wallet = await getWalletByUserId(req.user!.id);
    if (!wallet) {
      throw new AppError('WALLET_NOT_FOUND', 'Wallet no encontrada', 404);
    }

    const rates = await getRates();
    const amount_to = convertAmount(currency_from, 'ARS', amount_from, rates);
    const exchange_rate = amount_to / amount_from;

    const transaction = await executeConversion({
      walletId: wallet.id,
      type: 'sell',
      currencyFrom: currency_from,
      currencyTo: 'ARS',
      amountFrom: amount_from,
      amountTo: amount_to,
      exchangeRate: exchange_rate,
    });

    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}
