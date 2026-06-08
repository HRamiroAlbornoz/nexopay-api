CREATE TABLE IF NOT EXISTS balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  currency_code VARCHAR(3) NOT NULL,
  amount        NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_wallet_currency UNIQUE (wallet_id, currency_code)
);

CREATE TRIGGER trigger_balances_updated_at
  BEFORE UPDATE ON balances
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
