"""Latent Protocol — shared client core.

Used by the universal MCP server (pull tools) and by per-platform push
adapters (response-footer injection, etc.). Talks to the ad server over HTTP;
never touches the database directly.
"""

__version__ = "0.1.0"
