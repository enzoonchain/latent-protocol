"""Server configuration."""

import os

# Database (Railway Postgres) — direct asyncpg connection
DATABASE_URL = os.getenv("DATABASE_URL", "")

# x402 / Payments
EVM_ADDRESS = os.getenv("EVM_ADDRESS", "")
EVM_PRIVATE_KEY = os.getenv("EVM_PRIVATE_KEY", "")
EVM_NETWORK = os.getenv("EVM_NETWORK", "eip155:84532")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://x402.org/facilitator")
USDC_ADDRESS = os.getenv("USDC_ADDRESS", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")

# Rate limiting / frequency
MAX_IMPRESSIONS_PER_USER_PER_DAY = int(os.getenv("MAX_IMPRESSIONS_PER_USER_PER_DAY", "100"))
MAX_IMPRESSIONS_PER_SESSION = int(os.getenv("MAX_IMPRESSIONS_PER_SESSION", "20"))
# Don't show the same ad to the same user again within this window (minutes).
AD_FREQUENCY_WINDOW_MINUTES = int(os.getenv("AD_FREQUENCY_WINDOW_MINUTES", "30"))
PAYOUT_THRESHOLD_USDC = float(os.getenv("PAYOUT_THRESHOLD_USDC", "5.00"))

# Revenue split
USER_SHARE = 0.50      # 50% to user
OPERATOR_SHARE = 0.30   # 30% to operator
PROTOCOL_SHARE = 0.20   # 20% to protocol treasury

# A click is worth this many times an impression (bid multiplier).
CLICK_MULTIPLIER = float(os.getenv("CLICK_MULTIPLIER", "50"))
