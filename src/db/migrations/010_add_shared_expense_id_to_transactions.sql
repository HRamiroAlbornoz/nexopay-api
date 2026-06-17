-- Nullable: solo se completa en transacciones que vienen de liquidar un gasto
-- compartido. Permite rastrear qué transacciones originó un shared_expense
-- específico, en vez de tener que adivinar por wallet/monto/fecha aproximada.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS shared_expense_id UUID REFERENCES shared_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_shared_expense_id ON transactions(shared_expense_id);
