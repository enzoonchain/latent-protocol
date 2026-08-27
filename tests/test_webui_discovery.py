"""CLI-facing discovery helpers mirrored from detect.ts (Python parity for WebUI)."""

from __future__ import annotations

from pathlib import Path

from latent_protocol.adapters import hermes_webui as hw


def test_find_static_scans_nested_home(tmp_path: Path, monkeypatch):
    nested = tmp_path / "apps" / "hermes-webui" / "static"
    nested.mkdir(parents=True)
    (nested / "index.html").write_text(
        "<html><body><!-- hermes-webui --><script>window.__HERMES_WEBUI_BUNDLE_VERSION__='1'</script></body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    # Also clear env so candidates walk home scan
    monkeypatch.delenv("HERMES_WEBUI_STATIC", raising=False)
    monkeypatch.delenv("HERMES_WEBUI_ROOT", raising=False)
    monkeypatch.delenv("HERMES_WEBUI_DIR", raising=False)
    found = hw._find_static()
    assert found is not None
    assert found.resolve() == nested.resolve()


def test_candidate_list_includes_common_paths(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.setenv("HERMES_WEBUI_ROOT", str(tmp_path / "custom-webui"))
    cands = hw._candidate_static_dirs()
    assert any(p.name == "static" and "custom-webui" in str(p) for p in cands)
    assert any("hermes-webui" in str(p) for p in cands)
