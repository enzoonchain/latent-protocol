"""Platform push adapters (ad injection). MCP can't push, so each agent gets
a thin adapter that calls the shared core.

The recommended entry point for new integrations is ``UnifiedAdapter``:

    from latent_protocol.adapters import UnifiedAdapter
    adapter = UnifiedAdapter()          # auto-detects platform
    output = adapter.wrap(text)         # works on every platform
"""

from .unified import UnifiedAdapter, detect_platform

__all__ = ["UnifiedAdapter", "detect_platform"]
