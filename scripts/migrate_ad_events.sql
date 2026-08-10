-- Additive migration for existing deployments.
-- Safe to re-run. Also applied via scripts/schema.sql on fresh boots.

CREATE TABLE IF NOT EXISTS ad_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet  TEXT NOT NULL DEFAULT '',
    event_type   TEXT NOT NULL,
    reason       TEXT NOT NULL DEFAULT '',
    ad_id        UUID REFERENCES ads(id) ON DELETE SET NULL,
    agent        TEXT NOT NULL DEFAULT '',
    surface      TEXT NOT NULL DEFAULT '',
    context      TEXT NOT NULL DEFAULT '',
    tags         TEXT[] NOT NULL DEFAULT '{}',
    ip           TEXT NOT NULL DEFAULT '',
    earned       NUMERIC(18, 6) NOT NULL DEFAULT 0,
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_user_wallet ON ad_events (user_wallet);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at  ON ad_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_events_type        ON ad_events (event_type);
