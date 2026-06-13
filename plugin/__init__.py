"""Agent Kickbacks — Hermes plugin entry point.

Thin wrapper: all logic lives in the shared `agent_kickbacks` package so the
Hermes adapter and the universal MCP server stay in sync (one source of truth).
"""

from agent_kickbacks.adapters.hermes import register

__all__ = ["register"]
