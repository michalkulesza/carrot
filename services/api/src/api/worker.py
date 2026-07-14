import asyncio

from api.database import Base, engine
from api.services.import_worker import run


async def main() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await run()


if __name__ == "__main__":
    asyncio.run(main())
