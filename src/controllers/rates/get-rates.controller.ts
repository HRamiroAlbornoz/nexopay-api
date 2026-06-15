import { Request, Response, NextFunction } from 'express';
import { getRates } from '../../api-calls/frankfurter';

export async function getExchangeRates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rates = await getRates();
    res.status(200).json({ base: 'EUR', rates });
  } catch (err) {
    next(err);
  }
}
