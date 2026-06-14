-- Agent Kickbacks — Postgres schema (Railway)
-- Apply with: psql "$DATABASE_URL" -f scripts/schema.sql
-- Auth is wallet-based; there is no per-row auth layer here (the FastAPI
-- server is the only writer and enforces access control), so no RLS.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ── Advertisers ──
CREATE TABLE IF NOT EXISTS advertisers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Campaigns ──
CREATE TABLE IF NOT EXISTS campaigns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_wallet TEXT NOT NULL,
    name              TEXT NOT NULL,
    total_budget      NUMERIC(18, 6) NOT NULL,
    budget_remaining  NUMERIC(18, 6) NOT NULL,
    daily_cap         NUMERIC(18, 6),
    status            TEXT NOT NULL DEFAULT 'active',  -- active | paused | exhausted
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Ads (creatives) ──
CREATE TABLE IF NOT EXISTS ads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    cta_text            TEXT NOT NULL DEFAULT 'Learn more',
    cta_url             TEXT NOT NULL,
    image_url           TEXT,
    category            TEXT NOT NULL DEFAULT 'general',
    tags                TEXT[] NOT NULL DEFAULT '{}',
    bid_per_impression  NUMERIC(18, 6) NOT NULL DEFAULT 0.005,
    status              TEXT NOT NULL DEFAULT 'active',  -- active | paused
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Impressions ──
CREATE TABLE IF NOT EXISTS impressions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id        UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
    user_wallet  TEXT NOT NULL,
    agent        TEXT NOT NULL DEFAULT 'hermes',
    surface      TEXT NOT NULL DEFAULT 'any',
    context      TEXT NOT NULL DEFAULT '',
    clicked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Earnings (off-chain ledger; settled on-chain via payouts) ──
CREATE TABLE IF NOT EXISTS earnings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    impression_id  UUID REFERENCES impressions(id) ON DELETE SET NULL,
    amount         NUMERIC(18, 6) NOT NULL,
    kind           TEXT NOT NULL,  -- impression | click
    paid_out       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Payouts (on-chain USDC transfers on Base) ──
CREATE TABLE IF NOT EXISTS payouts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    amount         NUMERIC(18, 6) NOT NULL,
    tx_hash        TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Payments (settled advertiser x402 payments on Base — audit trail) ──
CREATE TABLE IF NOT EXISTS payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    kind           TEXT NOT NULL,            -- buy | fund
    amount         NUMERIC(18, 6) NOT NULL,
    network        TEXT NOT NULL,
    payer          TEXT,
    tx_hash        TEXT,
    status         TEXT NOT NULL DEFAULT 'settled',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_impressions_user_wallet ON impressions (user_wallet);
CREATE INDEX IF NOT EXISTS idx_impressions_ad_id       ON impressions (ad_id);
CREATE INDEX IF NOT EXISTS idx_impressions_created_at  ON impressions (created_at);
CREATE INDEX IF NOT EXISTS idx_earnings_wallet         ON earnings (wallet_address);
CREATE INDEX IF NOT EXISTS idx_earnings_unpaid         ON earnings (wallet_address) WHERE paid_out = FALSE;
CREATE INDEX IF NOT EXISTS idx_ads_status              ON ads (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser    ON campaigns (advertiser_wallet);
CREATE INDEX IF NOT EXISTS idx_payments_campaign       ON payments (campaign_id);
