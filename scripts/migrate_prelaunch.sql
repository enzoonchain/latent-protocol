-- Additive migration: pre-launch signups (wallet + scan metrics, no ads).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS prelaunch_signups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  TEXT NOT NULL UNIQUE,
    agents          TEXT[] NOT NULL DEFAULT '{}',
    metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prelaunch_wallet ON prelaunch_signups (wallet_address);
CREATE INDEX IF NOT EXISTS idx_prelaunch_created ON prelaunch_signups (created_at DESC);
