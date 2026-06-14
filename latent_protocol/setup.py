"""Wallet setup and config persistence for Latent Protocol.

Config file: ~/.latent-protocol/config.json
Priority:    config file > env vars > built-in defaults
"""

from __future__ import annotations

import json
import re
from pathlib import Path

_CONFIG_DIR = Path.home() / ".latent-protocol"
_CONFIG_FILE = _CONFIG_DIR / "config.json"
_EVM_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


# ── Config file helpers ──────────────────────────────────────────────────────

def load_config_file() -> dict:
    """Return saved config dict, or {} if none exists."""
    try:
        return json.loads(_CONFIG_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_config_file(data: dict) -> None:
    """Merge *data* into the config file (non-destructive for other keys)."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_config_file()
    existing.update(data)
    _CONFIG_FILE.write_text(json.dumps(existing, indent=2))


# ── Wallet helpers ───────────────────────────────────────────────────────────

def generate_wallet() -> tuple[str, str]:
    """Return (address, private_key) for a new random EVM wallet."""
    from eth_account import Account
    acct = Account.create()
    return acct.address, acct.key.hex()


def is_valid_address(address: str) -> bool:
    return bool(_EVM_ADDRESS_RE.match(address))


# ── Interactive CLI setup ────────────────────────────────────────────────────

def run_interactive_setup() -> None:
    """Walk the user through first-time wallet configuration."""
    print("\n🚀 Latent Protocol Setup\n")

    cfg = load_config_file()
    if cfg.get("wallet"):
        print(f"Current wallet: {cfg['wallet']}")
        change = input("Change it? [y/N]: ").strip().lower()
        if change != "y":
            print("No changes made.")
            return

    print("\nHow would you like to set up your wallet?")
    print("  [1] Generate a new wallet (recommended)")
    print("  [2] Use my existing wallet address")

    choice = input("\nChoice [1/2]: ").strip()

    if choice == "1":
        address, private_key = generate_wallet()
        print(f"\n✅ New wallet generated!")
        print(f"\n   Address:     {address}")
        print(f"   Private key: {private_key}")
        print("\n   ⚠️  Save your private key now — import it into MetaMask or")
        print("      any EVM wallet to access your USDC earnings.")
        print("      Latent Protocol only stores your address, not the private key.\n")
        input("Press Enter once you've saved your private key... ")
        save_config_file({"wallet": address})
        print(f"\n✅ Wallet saved to {_CONFIG_FILE}")

    elif choice == "2":
        while True:
            address = input("\nEnter your EVM wallet address (0x...): ").strip()
            if is_valid_address(address):
                break
            print("❌ Invalid address. Must be 0x followed by 40 hex characters.")
        save_config_file({"wallet": address})
        print(f"\n✅ Wallet saved to {_CONFIG_FILE}")

    else:
        print("Invalid choice. Run `latent-protocol setup` again.")
        return

    # Optional: customise frequency
    freq_raw = input(f"\nShow ads every N messages [default 5]: ").strip()
    if freq_raw.isdigit() and int(freq_raw) > 0:
        save_config_file({"frequency": int(freq_raw)})

    print("\n🎉 Setup complete! Your agent will now earn USDC from sponsored ads.")
    print(f"   Config: {_CONFIG_FILE}")
    print(f"   Check balance:   /ads balance  (Hermes)  |  check_balance()  (MCP)")
    print(f"   Request payout:  /ads payout   (Hermes)  |  request_payout() (MCP)\n")


def main() -> None:
    """Console-script entry point for `latent-protocol setup`."""
    run_interactive_setup()
