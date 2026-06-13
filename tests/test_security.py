"""Unit tests for impression-token integrity (no DB / no I/O)."""

import os

# Deterministic secret for the test process.
os.environ.setdefault("IMPRESSION_SIGNING_SECRET", "test-secret")

from server.security import make_impression_token, verify_impression_token


def test_valid_token_round_trips():
    tok = make_impression_token("ad1", "0xWALLET")
    assert verify_impression_token(tok, "ad1", "0xWALLET") is True


def test_token_bound_to_ad_and_wallet():
    tok = make_impression_token("ad1", "0xWALLET")
    assert verify_impression_token(tok, "ad2", "0xWALLET") is False
    assert verify_impression_token(tok, "ad1", "0xOTHER") is False


def test_expired_token_rejected():
    tok = make_impression_token("ad1", "0xWALLET", ttl=-1)
    assert verify_impression_token(tok, "ad1", "0xWALLET") is False


def test_tampered_signature_rejected():
    tok = make_impression_token("ad1", "0xWALLET")
    exp, _sig = tok.split(".", 1)
    assert verify_impression_token(f"{exp}.deadbeef", "ad1", "0xWALLET") is False


def test_garbage_token_rejected():
    for bad in ("", "nodot", "abc.def", "...."):
        assert verify_impression_token(bad, "ad1", "0xWALLET") is False
