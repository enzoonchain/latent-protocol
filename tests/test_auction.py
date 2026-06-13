"""Unit tests for auction / block helpers (pure)."""

from server.auction import block_cost, blocks_affordable, impressions_affordable


def test_impressions_affordable():
    assert impressions_affordable(1.0, 0.01) == 100
    assert impressions_affordable(0.999, 0.01) == 99  # floor


def test_impressions_affordable_zero_bid():
    assert impressions_affordable(10.0, 0.0) == 0


def test_blocks_affordable():
    # $100 at $0.005/impr = 20,000 impressions = 20 blocks
    assert blocks_affordable(100.0, 0.005) == 20
    # not quite 2 blocks' worth
    assert blocks_affordable(9.99, 0.005) == 1


def test_block_cost():
    assert block_cost(0.005, 20) == 100.0
    assert block_cost(0.01, 0) == 0.0
