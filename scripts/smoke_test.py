#!/usr/bin/env python3
"""Latent Protocol — Smoke test suite.

Validates the full client SDK: import, detection, config, ad fetching,
footer rendering, adapter wiring, and API connectivity.

Usage:
    python scripts/smoke_test.py
    python scripts/smoke_test.py --verbose   # extra output
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

# ── Colours ──────────────────────────────────────────────────────────────────

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
DIM = "\033[2m"
RESET = "\033[0m"

passed = 0
failed = 0
results: list[str] = []


def ok(name: str, detail: str = "") -> None:
    global passed
    passed += 1
    msg = f"{GREEN}✅{RESET} {name}"
    if detail:
        msg += f" {DIM}{detail}{RESET}"
    print(msg)
    results.append(f"PASS: {name}")


def fail(name: str, reason: str) -> None:
    global failed
    failed += 1
    msg = f"{RED}❌{RESET} {name} {RED}{reason}{RESET}"
    print(msg)
    results.append(f"FAIL: {name} — {reason}")


def skip(name: str, reason: str) -> None:
    msg = f"{YELLOW}⏭️{RESET}  {name} {DIM}{reason}{RESET}"
    print(msg)
    results.append(f"SKIP: {name} — {reason}")


# ── Test 1: Import ───────────────────────────────────────────────────────────

def test_import():
    try:
        import latent_protocol
        ver = getattr(latent_protocol, "__version__", "unknown")
        ok("Import latent_protocol", f"v{ver}")
    except ImportError as e:
        fail("Import latent_protocol", str(e))


# ── Test 2: Platform detection ───────────────────────────────────────────────

def test_platform_detection():
    try:
        from latent_protocol.adapters.unified import detect_platform
        platform = detect_platform()
        assert platform in ("hermes", "telegram", "cli", "mcp"), f"unknown: {platform}"
        ok("Platform detection", platform)
    except Exception as e:
        fail("Platform detection", str(e))


# ── Test 3: Config load ─────────────────────────────────────────────────────

def test_config():
    try:
        from latent_protocol.config import Config
        cfg = Config.from_env()
        assert cfg.server, "server is empty"
        assert isinstance(cfg.frequency, int), "frequency not int"
        assert isinstance(cfg.min_payout, float), "min_payout not float"
        wallet_display = cfg.wallet[:10] + "..." if cfg.wallet else "(not set)"
        ok("Config loaded", f"wallet={wallet_display} server={cfg.server}")
    except Exception as e:
        fail("Config loaded", str(e))


# ── Test 4: Ad client init ──────────────────────────────────────────────────

def test_ad_client():
    try:
        from latent_protocol.ad_client import AdClient
        client = AdClient("https://api.latentprotocol.xyz")
        assert client.server == "https://api.latentprotocol.xyz"
        ok("Ad client initialized")
    except Exception as e:
        fail("Ad client initialized", str(e))


# ── Test 5: Ad fetch ────────────────────────────────────────────────────────

def test_ad_fetch():
    try:
        from latent_protocol.ad_client import AdClient
        client = AdClient("https://api.latentprotocol.xyz")
        ad = client.get_ad(
            wallet="0x0000000000000000000000000000000000000000",
            context="test",
            agent="smoke_test",
            surface="test",
        )
        if ad:
            title = ad.get("title", "?")[:30]
            ok("Ad fetched", f'title="{title}"')
        else:
            skip("Ad fetched", "no ads available (ok in test env)")
    except Exception as e:
        fail("Ad fetched", str(e))


# ── Test 6: Footer format ───────────────────────────────────────────────────

def test_footer():
    try:
        from latent_protocol.footer import format_footer
        fake_ad = {
            "title": "Test Ad",
            "body": "This is a test",
            "cta_text": "Learn more",
            "cta_url": "https://example.com",
            "earn_amount": 0.005,
        }
        md_footer = format_footer(fake_ad, style="markdown")
        assert "This is a test" in md_footer, "body missing"
        assert "Learn more" in md_footer, "cta missing"

        cli_footer = format_footer(fake_ad, style="cli")
        assert "\033[" in cli_footer, "no ANSI codes in cli"

        tg_footer = format_footer(fake_ad, style="telegram")
        assert "This is a test" in tg_footer, "body missing in telegram"

        ok("Footer format", f"markdown={len(md_footer)} cli={len(cli_footer)} telegram={len(tg_footer)} chars")
    except Exception as e:
        fail("Footer format", str(e))


# ── Test 7: Frequency counter ───────────────────────────────────────────────

def test_frequency_counter():
    try:
        from latent_protocol.footer import FrequencyCounter
        counter = FrequencyCounter(3)
        assert counter.tick() is False, "1st tick should be False"
        assert counter.tick() is False, "2nd tick should be False"
        assert counter.tick() is True, "3rd tick should be True"
        assert counter.tick() is False, "4th tick should be False"
        ok("Frequency counter", "3-count cycle works")
    except Exception as e:
        fail("Frequency counter", str(e))


# ── Test 8: Unified adapter init ────────────────────────────────────────────

def test_unified_adapter():
    try:
        from latent_protocol.adapters.unified import UnifiedAdapter
        adapter = UnifiedAdapter()
        assert adapter.platform in ("hermes", "telegram", "cli", "mcp")
        assert adapter.style in ("markdown", "telegram", "cli")
        ok("UnifiedAdapter", f"platform={adapter.platform} style={adapter.style}")
    except Exception as e:
        fail("UnifiedAdapter", str(e))


# ── Test 9: Wrap flow ───────────────────────────────────────────────────────

def test_wrap_flow():
    try:
        from latent_protocol.adapters.unified import UnifiedAdapter
        from latent_protocol.config import Config
        cfg = Config(enabled=True, wallet="0xDEADBEEF", server="https://api.latentprotocol.xyz",
                      frequency=1, min_payout=5.0, categories=["all"])
        adapter = UnifiedAdapter(config=cfg)
        adapter._client = MagicMock()
        adapter._client.get_ad.return_value = {
            "title": "Smoke Test Ad",
            "body": "Testing wrap",
            "cta_text": "Go",
            "cta_url": "https://example.com",
            "earn_amount": 0.001,
            "impression_token": "tok-123",
        }
        adapter._tracker = MagicMock()

        output = adapter.wrap("Hello world", context="test")
        assert "Hello world" in output, "original text missing"
        assert "Testing wrap" in output, "ad not appended"
        ok("Wrap flow", f"output={len(output)} chars")
    except Exception as e:
        fail("Wrap flow", str(e))


# ── Test 10: API health ─────────────────────────────────────────────────────

def test_api_health():
    try:
        import httpx
        resp = httpx.get("https://api.latentprotocol.xyz/health", timeout=5.0)
        assert resp.status_code == 200, f"status {resp.status_code}"
        data = resp.json()
        assert data.get("status") == "ok", f"status={data.get('status')}"
        ok("API health", f"network={data.get('network')}")
    except Exception as e:
        fail("API health", str(e))


# ── Test 11: Wallet config check ────────────────────────────────────────────

def test_wallet_config():
    config_file = Path.home() / ".latent-protocol" / "config.json"
    if config_file.exists():
        try:
            data = json.loads(config_file.read_text())
            wallet = data.get("wallet", "")
            if wallet:
                ok("Wallet config", f"{wallet[:10]}...")
            else:
                skip("Wallet config", "wallet field empty — run latent-setup")
        except Exception as e:
            fail("Wallet config", str(e))
    else:
        skip("Wallet config", "no config file — run latent-setup")


# ── Test 12: MCP server entry point ─────────────────────────────────────────

def test_mcp_server():
    try:
        from latent_protocol.mcp_server import main
        assert callable(main), "main is not callable"
        ok("MCP server entry point", "latent-mcp available")
    except Exception as e:
        fail("MCP server entry point", str(e))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"\n{'='*60}")
    print(f"  Latent Protocol — Smoke Test Suite")
    print(f"{'='*60}\n")

    tests = [
        test_import,
        test_platform_detection,
        test_config,
        test_ad_client,
        test_ad_fetch,
        test_footer,
        test_frequency_counter,
        test_unified_adapter,
        test_wrap_flow,
        test_api_health,
        test_wallet_config,
        test_mcp_server,
    ]

    for test in tests:
        test()

    print(f"\n{'='*60}")
    total = passed + failed
    if failed == 0:
        print(f"  {GREEN}{passed}/{total} passed{RESET} — Latent Protocol ready")
    else:
        print(f"  {RED}{failed} failed{RESET}, {GREEN}{passed} passed{RESET} — {total} total")
    print(f"{'='*60}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
