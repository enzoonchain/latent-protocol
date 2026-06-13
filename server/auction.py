"""Block-bidding / auction helpers.

Advertisers fund a campaign budget and bid a price per impression. Ranking on
the serve side is bid-weighted (see `matcher.select_best_ad`); these pure
helpers convert budget ↔ impression "blocks" for funding and reporting.
"""

BLOCK_SIZE = 1000  # impressions per block


def impressions_affordable(budget: float, bid: float) -> int:
    """How many impressions a budget can still serve at this bid."""
    if bid <= 0:
        return 0
    # +epsilon so float imprecision doesn't drop a whole impression
    # (e.g. 1.0 / 0.01 == 99.999… without it).
    return int(budget / bid + 1e-9)


def blocks_affordable(budget: float, bid: float, block_size: int = BLOCK_SIZE) -> int:
    """How many whole 1,000-impression blocks the budget covers."""
    return impressions_affordable(budget, bid) // block_size


def block_cost(bid: float, blocks: int, block_size: int = BLOCK_SIZE) -> float:
    """Cost in USDC to buy ``blocks`` blocks at this bid."""
    return round(bid * block_size * max(blocks, 0), 6)
