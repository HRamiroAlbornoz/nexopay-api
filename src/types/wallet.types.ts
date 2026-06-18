import { CurrencyCode } from './currency.types';

export interface Wallet {
  id: string;
  user_id: string;
  created_at: Date;
}

export interface Balance {
  currency_code: string;
  amount: number;
}

export type BalanceHistoryPoint = { date: string } & Record<CurrencyCode, number>;