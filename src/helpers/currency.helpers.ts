import { CurrencyCode, ExchangeRates } from '../types/currency.types';

export function convertAmount(
  from: CurrencyCode,
  to: CurrencyCode,
  amount: number,
  rates: ExchangeRates
): number {
  if (from === to) return amount;

  const amountInEur = amount / rates[from];
  return amountInEur * rates[to];
}
