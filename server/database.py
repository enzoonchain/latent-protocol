"""Async Postgres database layer (Railway) — SQLAlchemy + asyncpg.

Railway injects a `DATABASE_URL`. Internal domain (no SSL) or TCP proxy (SSL).
"""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_kickbacks"

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _normalize_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        url = _normalize_url(os.getenv("DATABASE_URL", DEFAULT_URL))
        connect_args = {}
        # Railway TCP proxy needs SSL; internal domain does not
        if "proxy.rlwy.net" in url:
            import ssl as _ssl
            ssl_ctx = _ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = _ssl.CERT_NONE
            connect_args["ssl"] = ssl_ctx
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
    if _sessionmaker is None:
        get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session
