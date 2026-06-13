"""USDC payout engine — on-chain transfers on Base.

Sends USDC from the operator wallet to user wallets via a raw ERC-20
`transfer(address,uint256)` call. Signs with EVM_PRIVATE_KEY and submits
through a Base RPC endpoint.

Idempotent: the caller must guard against double-pay (check payout status
in DB before calling).
"""

import httpx
from eth_account import Account

USDC_DECIMALS = 6
USDC_TRANSFER_SELECTOR = "0xa9059cbb"  # transfer(address,uint256)


def _build_usdc_transfer(
    to_address: str,
    amount_usdc: float,
    nonce: int,
    chain_id: int,
    gas_price_wei: int,
    usdc_address: str,
) -> dict:
    """Build an unsigned ERC-20 transfer transaction dict."""
    amount_raw = int(amount_usdc * (10**USDC_DECIMALS))
    # pad address to 32 bytes (left-padded with zeros)
    padded_to = to_address.lower().replace("0x", "").zfill(64)
    data = USDC_TRANSFER_SELECTOR + padded_to + hex(amount_raw)[2:].zfill(64)

    return {
        "to": usdc_address,
        "value": "0x0",
        "gas": "0x30d40",  # 200k gas — generous for ERC-20 transfer
        "gasPrice": hex(gas_price_wei),
        "nonce": hex(nonce),
        "chainId": chain_id,
        "data": data,
    }


async def send_usdc(
    to_address: str,
    amount_usdc: float,
    private_key: str,
    rpc_url: str,
    usdc_address: str,
    chain_id: int = 84532,  # Base Sepolia by default
) -> str:
    """Sign and broadcast a USDC transfer on Base.

    Returns the transaction hash string, or raises on failure.
    """
    account = Account.from_key(private_key)
    sender = account.address

    async with httpx.AsyncClient(timeout=15.0) as http:
        # Get nonce
        nonce_resp = await http.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_getTransactionCount",
                "params": [sender, "pending"],
                "id": 1,
            },
        )
        nonce = int(nonce_resp.json()["result"], 16)

        # Get gas price
        gp_resp = await http.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_gasPrice",
                "params": [],
                "id": 2,
            },
        )
        gas_price = int(gp_resp.json()["result"], 16)

        # Build, sign, broadcast
        tx = _build_usdc_transfer(to_address, amount_usdc, nonce, chain_id, gas_price, usdc_address)
        signed = account.sign_transaction(tx)
        raw_tx = signed.raw_transaction.hex()
        if not raw_tx.startswith("0x"):
            raw_tx = "0x" + raw_tx

        send_resp = await http.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_sendRawTransaction",
                "params": [raw_tx],
                "id": 3,
            },
        )
        result = send_resp.json()
        if "error" in result:
            raise RuntimeError(f"RPC error: {result['error']['message']}")
        return result["result"]
