DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_status') THEN
    CREATE TYPE expense_status AS ENUM ('pending', 'settled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shared_expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL,
  total_amount         NUMERIC(18, 6) NOT NULL CHECK (total_amount > 0),
  currency_code        VARCHAR(3) NOT NULL,
  status               expense_status NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_expense_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  wallet_id   UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount_owed NUMERIC(18, 6) NOT NULL CHECK (amount_owed > 0),
  amount_paid NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_expense_member UNIQUE (expense_id, wallet_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_expenses_wallet_id ON shared_expenses(created_by_wallet_id);
CREATE INDEX IF NOT EXISTS idx_shared_expense_members_expense_id ON shared_expense_members(expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_expense_members_wallet_id ON shared_expense_members(wallet_id);
