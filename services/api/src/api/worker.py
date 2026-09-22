import asyncio
import logging

from sqlalchemy import text

from api.database import Base, engine, initialize_vector_schema
from api.services.import_worker import run

logging.basicConfig(level=logging.INFO)
logging.getLogger("api.services.transcription").setLevel(logging.DEBUG)
logging.getLogger("api.services.pipeline").setLevel(logging.DEBUG)


async def main() -> None:
    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await connection.run_sync(Base.metadata.create_all)
        await initialize_vector_schema(connection)
        await connection.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS dimensions INTEGER NOT NULL DEFAULT 768"))
        await connection.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS document_version VARCHAR(30) NOT NULL DEFAULT 'v1'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS issue_codes JSON NOT NULL DEFAULT '[]'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_provenance JSON NOT NULL DEFAULT '{}'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_status VARCHAR(20) NOT NULL DEFAULT 'unknown'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS total_time_provenance JSON NOT NULL DEFAULT '{\"status\":\"unknown\"}'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergen_status VARCHAR(20) NOT NULL DEFAULT 'unknown'"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS overview TEXT"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_title TEXT"))
        await connection.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS title_evidence JSON NOT NULL DEFAULT '[]'"))
        await connection.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(32)"))
        await connection.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS outcome VARCHAR(20)"))
    await run()


if __name__ == "__main__":
    asyncio.run(main())
