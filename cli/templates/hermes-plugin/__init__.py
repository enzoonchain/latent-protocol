"""Latent Protocol — Hermes plugin entry point (flat install).

Installed by `npx latent-protocol init` into ~/.hermes/plugins/agent-ads/.
Requires: pip install latent-protocol
"""

from latent_protocol.adapters.hermes import register

__all__ = ["register"]
