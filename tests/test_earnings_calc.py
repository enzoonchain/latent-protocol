"""Unit tests for earnings math (no DB required)."""

from server.config import CLICK_MULTIPLIER, USER_SHARE
from server.tracker import user_earning_for_click, user_earning_for_impression


def test_impression_earning_is_user_share():
    assert user_earning_for_impression(0.010) == round(0.010 * USER_SHARE, 6)


def test_click_earning_is_multiplied():
    bid = 0.010
    expected = round(bid * USER_SHARE * CLICK_MULTIPLIER, 6)
    assert user_earning_for_click(bid) == expected


def test_click_is_multiplier_times_impression():
    bid = 0.007
    assert user_earning_for_click(bid) == round(
        user_earning_for_impression(bid) * CLICK_MULTIPLIER, 6
    )
