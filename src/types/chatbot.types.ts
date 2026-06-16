import { Balance } from './wallet.types';
import { ExchangeRates } from './currency.types';
import { Transaction } from '../queries/transaction.queries';

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  reply: string;
}

export interface ChatbotTransactionSummary {
  type: Transaction['type'];
  currency_from: string;
  currency_to: string;
  amount_from: number;
  amount_to: number;
  exchange_rate: number;
  created_at: Date;
}

export interface ChatbotContext {
  balances: Balance[];
  recentTransactions: ChatbotTransactionSummary[];
  // null cuando Frankfurter falla — el chatbot sigue respondiendo sobre balances/transacciones sin tasas.
  rates: ExchangeRates | null;
}
