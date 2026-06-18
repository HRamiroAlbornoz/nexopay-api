import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow } from '../../queries/wallet.queries';
import { executeConversion } from '../../queries/transaction.queries';
import { getRates } from '../../api-calls/exchange-rates';
import { convertAmount } from '../../helpers/currency.helpers';

const exchangeSchema = z.object({
  currency_from: z.enum(['USD', 'EUR']),
  currency_to: z.enum(['USD', 'EUR']),
  amount_from: z.number().positive(),
}).refine((data) => data.currency_from !== data.currency_to, {
  message: 'Las monedas de origen y destino deben ser distintas',
  path: ['currency_to'],
});

export async function exchange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = exchangeSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { currency_from, currency_to, amount_from } = parsed.data;

    const wallet = await findWalletByUserIdOrThrow(req.user!.id);

    const rates = await getRates();
    const amount_to = convertAmount(currency_from, currency_to, amount_from, rates);
    const exchange_rate = amount_to / amount_from;

    const transaction = await executeConversion({
      walletId: wallet.id,
      type: 'exchange',
      currencyFrom: currency_from,
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
