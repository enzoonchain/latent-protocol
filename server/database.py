"""Async Postgres database layer (Railway) — SQLAlchemy + asyncpg.

Railway injects a `DATABASE_URL`. We connect directly with asyncpg for low
latency (the plugin enforces a 2s timeout on ad requests), rather than going
through a REST layer.
"""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Local default mirrors docker-compose; Railway overrides via DATABASE_URL.
DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_kickbacks"

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _normalize_url(url: str) -> str:
    """Coerce a libpq-style URL to the asyncpg driver.

    Railway/Postgres hand out `postgresql://` (or legacy `postgres://`);
    SQLAlchemy's async engine needs the `+asyncpg` driver suffix.
    """
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def get_engine() -> AsyncEngine:
    """Get or create the shared async engine + sessionmaker."""
    global _engine, _sessionmaker
    if _engine is None:
        url = _normalize_url(os.getenv("DATABASE_URL", DEFAULT_URL))
        # asyncpg doesn't understand sslmode=, convert to ssl= for asyncpg
        connect_args = {}
        if "sslmode=require" in url:
            url = url.replace("sslmode=require", "")
            url = url.rstrip("?&")
            if "?" not in url:
                url = url.split("?")[0]
            connect_args["ssl"] = "require"
        _engine = create_async_engine(
            url,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        _sessionmaker = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False
        )
    return _engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async DB session per request."""
    if _sessionmaker is None:
        get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session
