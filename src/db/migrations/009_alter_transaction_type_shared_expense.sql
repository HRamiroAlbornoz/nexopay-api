-- Dos valores, no uno: registran ambos lados del saldo de un gasto compartido
-- (quien paga su parte y quien la recibe), igual que transfer_in/transfer_out.
-- Statement único, sin envolver en una transacción propia: Postgres no permite
-- usar un valor de ENUM agregado con ADD VALUE dentro de la misma transacción
-- en que se agregó.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'shared_expense_paid';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'shared_expense_received';
