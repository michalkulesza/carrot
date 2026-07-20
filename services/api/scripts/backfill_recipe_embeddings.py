from __future__ import annotations

import argparse
import asyncio

from api.services.embeddings import backfill_embeddings


async def main() -> None:
    parser = argparse.ArgumentParser(description="Queue missing or outdated recipe embeddings.")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    count = await backfill_embeddings(max(1, args.batch_size))
    print(f"queued={count}")


if __name__ == "__main__":
    asyncio.run(main())
