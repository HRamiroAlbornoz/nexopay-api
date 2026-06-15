export interface ExpenseMemberInput {
  wallet_id: string;
  amount_owed: number;
}

export interface CreateExpenseInput {
  title: string;
  total_amount: number;
  currency_code: string;
  members: ExpenseMemberInput[];
}