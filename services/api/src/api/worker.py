import asyncio

from sqlalchemy import text

from api.database import Base, engine, initialize_vector_schema
from api.services.import_worker import run


async def main() -> None:
    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await connection.run_sync(Base.metadata.create_all)
        await initialize_vector_schema(connection)
        await connection.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS dimensions INTEGER NOT NULL DEFAULT 768"))
        await connection.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS document_version VARCHAR(30) NOT NULL DEFAULT 'v1'"))
    await run()


if __name__ == "__main__":
    asyncio.run(main())
