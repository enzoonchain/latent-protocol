"""Latent Protocol — Hermes plugin entry point.

Thin wrapper: all logic lives in the shared `latent_protocol` package so the
Hermes adapter and the universal MCP server stay in sync (one source of truth).
"""

from latent_protocol.adapters.hermes import register

__all__ = ["register"]
