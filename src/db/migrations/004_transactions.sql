CREATE TYPE transaction_type AS ENUM ('buy', 'sell', 'exchange', 'transfer_in', 'transfer_out');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type            transaction_type NOT NULL,
  status          transaction_status NOT NULL DEFAULT 'completed',
  currency_from   VARCHAR(3) NOT NULL,
  currency_to     VARCHAR(3) NOT NULL,
  amount_from     NUMERIC(18, 6) NOT NULL CHECK (amount_from > 0),
  amount_to       NUMERIC(18, 6) NOT NULL CHECK (amount_to > 0),
  exchange_rate   NUMERIC(18, 6) NOT NULL CHECK (exchange_rate > 0),
  related_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
