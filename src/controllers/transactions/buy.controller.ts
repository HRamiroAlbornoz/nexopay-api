import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { executeConversion } from '../../queries/transaction.queries';
import { getRates } from '../../api-calls/frankfurter';
import { convertAmount } from '../../helpers/currency.helpers';

const buySchema = z.object({
  currency_to: z.enum(['USD', 'EUR']),
  amount_from: z.number().positive(),
});

export async function buy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = buySchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { currency_to, amount_from } = parsed.data;

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const rates = await getRates();
    const amount_to = convertAmount('ARS', currency_to, amount_from, rates);
    const exchange_rate = amount_to / amount_from;

    const transaction = await executeConversion({
      walletId: wallet.id,
      type: 'buy',
      currencyFrom: 'ARS',
      currencyTo: currency_to,
      amountFrom: amount_from,
      amountTo: amount_to,
      exchangeRate: exchange_rate,
    });

    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}
