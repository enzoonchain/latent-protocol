"""Ad targeting and selection engine.

Selects the best ad based on context, tags, and bid amount.
"""

import random
from typing import Optional


async def select_best_ad(
    context: str,
    tags: list[str],
    agent: str,
    surface: str,
    user_wallet: str,
) -> Optional[dict]:
    """Select the best matching ad from available inventory.

    Algorithm:
    1. Filter ads by: status=active, budget_remaining > bid, not expired
    2. Match by: category/tags overlap with context
    3. Rank by: bid_per_impression (higher = more likely to serve)
    4. Frequency cap: skip if user seen this ad recently
    5. Weighted random selection from top candidates
    """
    # TODO: implement with Supabase
    # For now, return None (no ads available)
    #
    # Future implementation:
    # 1. Query Supabase: SELECT * FROM ads WHERE status = 'active'
    #    AND budget_remaining > bid_per_impression
    #    AND (expires_at IS NULL OR expires_at > NOW())
    # 2. Filter by tag/category match
    # 3. Exclude recently shown to this user (frequency cap)
    # 4. Weighted random by bid amount
    # 5. Return best match
    return None
