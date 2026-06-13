-- Agent Kickbacks — test seed data
-- Apply after schema.sql:  psql "$DATABASE_URL" -f scripts/seed.sql

-- Test advertiser
INSERT INTO advertisers (id, wallet_address)
VALUES ('00000000-0000-0000-0000-0000000000a1', '0xADVERTISER0000000000000000000000000000a1')
ON CONFLICT (wallet_address) DO NOTHING;

-- Test campaign with budget
INSERT INTO campaigns (id, advertiser_wallet, name, total_budget, budget_remaining, status)
VALUES (
    '00000000-0000-0000-0000-0000000000c1',
    '0xADVERTISER0000000000000000000000000000a1',
    'Seed Campaign',
    100.0, 100.0, 'active'
)
ON CONFLICT (id) DO NOTHING;

-- A couple of ad creatives in different categories
INSERT INTO ads (campaign_id, title, body, cta_text, cta_url, category, tags, bid_per_impression)
VALUES
    (
        '00000000-0000-0000-0000-0000000000c1',
        'Trade on BaseSwap',
        'Lowest fees on Base. Swap any token in seconds.',
        'Start trading', 'https://example.com/baseswap',
        'defi', ARRAY['defi', 'dex', 'base', 'trading'], 0.010
    ),
    (
        '00000000-0000-0000-0000-0000000000c1',
        'Audit your contract',
        'Automated Solidity security scans before you ship.',
        'Scan now', 'https://example.com/audit',
        'security', ARRAY['security', 'solidity', 'audit'], 0.008
    ),
    (
        '00000000-0000-0000-0000-0000000000c1',
        'Bridge to Base',
        'Move assets to Base with near-zero gas.',
        'Bridge now', 'https://example.com/bridge',
        'general', ARRAY['bridge', 'base', 'l2'], 0.005
    );
