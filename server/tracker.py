"""Impression and click tracking."""

from server.config import USER_SHARE, OPERATOR_SHARE, PROTOCOL_SHARE


async def log_impression(
    ad_id: str,
    user_wallet: str,
    agent: str,
    surface: str,
    context: str,
) -> None:
    """Log an impression and calculate revenue split.

    Revenue split:
    - 50% to user
    - 30% to operator
    - 20% to protocol treasury
    """
    # TODO: insert into Supabase impressions table
    # TODO: calculate bid from ad_id
    # TODO: create earnings record for user share
    # TODO: update advertiser budget_remaining
    pass


async def log_click(ad_id: str, user_wallet: str) -> None:
    """Log a click event.

    Clicks are worth 50x an impression.
    """
    # TODO: update impression record: clicked = true
    # TODO: create earnings record for click value
    pass
