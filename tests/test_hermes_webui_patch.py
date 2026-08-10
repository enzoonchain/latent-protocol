"""Tests for hermes-webui DOM patch helpers."""

from __future__ import annotations

from pathlib import Path

from latent_protocol.adapters import hermes_webui as hw


def test_patch_and_unpatch_roundtrip(tmp_path: Path):
    static = tmp_path / "static"
    static.mkdir()
    index = static / "index.html"
    index.write_text(
        "<html><body><div id='app' data-hermes-webui='1'></div>"
        "<!-- hermes-webui --></body></html>",
        encoding="utf-8",
    )

    msg = hw.patch(
        server="https://api.latentprotocol.xyz",
        wallet="0x" + "ab" * 20,
        frequency=1,
        static_dir=static,
    )
    assert "Patched:" in msg
    html = index.read_text(encoding="utf-8")
    assert hw._MARKER in html
    assert "api.latentprotocol.xyz" in html
    assert "webui_thinking" in html
    assert "latent-ad-footer" in html
    assert "</body>" in html

    # force re-patch replaces (does not duplicate)
    hw.patch(
        server="https://api.example.test",
        wallet="0x" + "cd" * 20,
        frequency=1,
        static_dir=static,
        force=True,
    )
    html2 = index.read_text(encoding="utf-8")
    assert html2.count(hw._MARKER) == 1
    assert "api.example.test" in html2

    msg_u = hw.unpatch(static)
    assert "Unpatched:" in msg_u
    assert hw._MARKER not in index.read_text(encoding="utf-8")


def test_find_static_respects_env(tmp_path: Path, monkeypatch):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text(
        "<html><body><!-- hermes-webui --></body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.setenv("HERMES_WEBUI_STATIC", str(static))
    monkeypatch.delenv("HERMES_WEBUI_ROOT", raising=False)
    monkeypatch.delenv("HERMES_WEBUI_DIR", raising=False)
    assert hw._find_static() == static.resolve()
