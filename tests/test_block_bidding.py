"""Tests for block bidding / auction logic."""

from server.auction import BLOCK_SIZE, block_cost, blocks_affordable, impressions_affordable


def test_impressions_affordable():
    assert impressions_affordable(10.0, 0.005) == 2000
    assert impressions_affordable(1.0, 0.01) == 100
    assert impressions_affordable(0.0, 0.005) == 0


def test_impressions_affordable_zero_bid():
    assert impressions_affordable(10.0, 0.0) == 0
    assert impressions_affordable(10.0, -1.0) == 0


def test_blocks_affordable():
    assert blocks_affordable(10.0, 0.005) == 2  # 2000 impr / 1000
    assert blocks_affordable(5.0, 0.005) == 1  # 1000 impr / 1000
    assert blocks_affordable(4.999, 0.005) == 0  # 999 impr < 1 block


def test_block_cost():
    assert block_cost(0.005, 1) == 5.0  # 1000 × 0.005
    assert block_cost(0.005, 2) == 10.0
    assert block_cost(0.01, 3) == 30.0
    assert block_cost(0.005, 0) == 0.0


def test_block_cost_negative_blocks():
    assert block_cost(0.005, -1) == 0.0


def test_block_size_constant():
    assert BLOCK_SIZE == 1000
