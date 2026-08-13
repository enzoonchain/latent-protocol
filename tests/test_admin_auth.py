"""Admin auth helpers."""

from server.admin_auth import admin_configured, verify_admin_key


def test_verify_admin_key_when_unconfigured(monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    assert not admin_configured()
    assert not verify_admin_key("anything")


def test_verify_admin_key_matches(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "test-secret-key")
    assert admin_configured()
    assert verify_admin_key("test-secret-key")
    assert not verify_admin_key("wrong")
