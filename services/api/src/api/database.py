from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from api.config import settings

engine = create_async_engine(settings.database_url)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def initialize_vector_schema(connection: AsyncConnection) -> None:
    await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    await connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_recipe_embeddings_embedding_hnsw "
        "ON recipe_embeddings USING hnsw (embedding vector_cosine_ops) "
        f"WITH (m = {settings.embedding_hnsw_m}, ef_construction = {settings.embedding_hnsw_ef_construction})"
    ))
