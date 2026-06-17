import { CurrencyCode } from './currency.types';

export interface SharedExpenseMember {
  id: string;
  wallet_id: string;
  amount_owed: number;
  amount_paid: number;
}

export interface SharedExpense {
  id: string;
  created_by_wallet_id: string;
  title: string;
  total_amount: number;
  currency_code: string;
  status: 'pending' | 'settled';
  created_at: Date;
  members: SharedExpenseMember[];
}

export interface ExpenseMemberInput {
  walletId: string;
  amountOwed: number;
}

export interface CreateSharedExpenseInput {
  creatorWalletId: string;
  title: string;
  totalAmount: number;
  currencyCode: CurrencyCode;
  members: ExpenseMemberInput[];
}
