"""Async Postgres database layer (Railway) — SQLAlchemy + psycopg.

Railway injects a `DATABASE_URL`. We use psycopg (psycopg3) which handles
Railway's TCP proxy SSL correctly.
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
DEFAULT_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/agent_kickbacks"

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _normalize_url(url: str) -> str:
    """Coerce a libpq-style URL to the psycopg driver."""
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def get_engine() -> AsyncEngine:
    """Get or create the shared async engine + sessionmaker."""
    global _engine, _sessionmaker
    if _engine is None:
        url = _normalize_url(os.getenv("DATABASE_URL", DEFAULT_URL))
        _engine = create_async_engine(
            url,
            pool_pre_ping=True,
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
