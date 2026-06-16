DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_status') THEN
    CREATE TYPE goal_status AS ENUM ('active', 'completed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS savings_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  target_amount   NUMERIC(18, 6) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency_code   VARCHAR(3) NOT NULL,
  status          goal_status NOT NULL DEFAULT 'active',
  target_date     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_savings_goals_updated_at ON savings_goals;
CREATE TRIGGER trigger_savings_goals_updated_at
  BEFORE UPDATE ON savings_goals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_savings_goals_wallet_id ON savings_goals(wallet_id);
