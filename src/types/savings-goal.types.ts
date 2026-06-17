import { CurrencyCode } from './currency.types';

export interface SavingsGoal {
  id: string;
  wallet_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  status: 'active' | 'completed' | 'cancelled';
  target_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSavingsGoalInput {
  walletId: string;
  title: string;
  targetAmount: number;
  currencyCode: CurrencyCode;
  targetDate?: Date;
}
