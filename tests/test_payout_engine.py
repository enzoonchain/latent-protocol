"""Tests for the payout engine (USDC transfer on Base)."""

from server.payout_engine import _build_usdc_transfer, USDC_DECIMALS, USDC_TRANSFER_SELECTOR


def test_build_transfer_basic():
    tx = _build_usdc_transfer(
        to_address="0x1234567890abcdef1234567890abcdef12345678",
        amount_usdc=10.5,
        nonce=0,
        chain_id=84532,
        gas_price_wei=1_000_000_000,
        usdc_address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    )
    assert tx["to"] == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    assert tx["value"] == "0x0"
    assert tx["chainId"] == 84532
    assert tx["nonce"] == "0x0"
    assert tx["gasPrice"] == "0x3b9aca00"
    assert tx["data"].startswith(USDC_TRANSFER_SELECTOR)


def test_transfer_data_encoding():
    amount = 100.0
    tx = _build_usdc_transfer(
        to_address="0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
        amount_usdc=amount,
        nonce=5,
        chain_id=8453,
        gas_price_wei=500,
        usdc_address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    )
    data = tx["data"]
    assert data[:10] == USDC_TRANSFER_SELECTOR
    # 100 USDC = 100 * 10^6 = 100000000 = 0x5F5E100
    amount_hex = hex(int(amount * (10**USDC_DECIMALS)))[2:]
    assert amount_hex in data


def test_zero_amount():
    tx = _build_usdc_transfer(
        to_address="0x0000000000000000000000000000000000000001",
        amount_usdc=0.0,
        nonce=0,
        chain_id=84532,
        gas_price_wei=1,
        usdc_address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    )
    assert tx["data"].startswith(USDC_TRANSFER_SELECTOR)
    assert tx["chainId"] == 84532


def test_mainnet_chain_id():
    tx = _build_usdc_transfer(
        to_address="0x0000000000000000000000000000000000000001",
        amount_usdc=1.0,
        nonce=0,
        chain_id=8453,
        gas_price_wei=1,
        usdc_address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    )
    assert tx["chainId"] == 8453
    assert tx["to"] == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
