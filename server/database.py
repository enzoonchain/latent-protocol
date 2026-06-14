"""Async Postgres database layer (Railway) — SQLAlchemy + asyncpg."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/latent_protocol"

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
        # Railway's internal network (.railway.internal) does not support SSL;
        # asyncpg negotiates TLS by default which causes ConnectionRefused.
        connect_args: dict = {}
        if ".railway.internal" in url:
            connect_args["ssl"] = False
        _engine = create_async_engine(url, pool_pre_ping=True, connect_args=connect_args)
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
