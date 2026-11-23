import argparse
import asyncio
from dataclasses import dataclass

from botocore.exceptions import ClientError
from sqlalchemy import select

import api.users  # noqa: F401  registers User so Recipe's relationships resolve
from api.config import settings
from api.database import async_session_maker
from api.models import Recipe
from api.services.image_resize import encode_jpeg, open_rgb
from api.services.monitoring import init_sentry
from api.services.r2 import SMALL_QUALITY, SMALL_WIDTH, _s3_client, small_key


@dataclass
class Counts:
    created: int = 0
    skipped: int = 0
    failed: int = 0


def _key_for(url: str) -> str | None:
    prefix = settings.r2_public_url.rstrip("/") + "/"
    if not settings.r2_public_url or not url.startswith(prefix):
        return None
    return url[len(prefix):]


def _object_exists(client, key: str) -> bool:
    try:
        client.head_object(Bucket=settings.r2_bucket_name, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise
    return True


def _create_small(client, key: str, dry_run: bool) -> bool:
    target = small_key(key)
    if _object_exists(client, target):
        return False
    if dry_run:
        return True

    full = client.get_object(Bucket=settings.r2_bucket_name, Key=key)["Body"].read()
    client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=target,
        Body=encode_jpeg(open_rgb(full), SMALL_WIDTH, SMALL_QUALITY),
        ContentType="image/jpeg",
    )
    return True


async def _process(client, key: str, dry_run: bool, counts: Counts) -> None:
    try:
        created = await asyncio.to_thread(_create_small, client, key, dry_run)
    except Exception as exc:
        counts.failed += 1
        print(f"failed {key}: {type(exc).__name__}: {exc}")
        return
    if created:
        counts.created += 1
    else:
        counts.skipped += 1


async def main(batch_size: int, dry_run: bool) -> None:
    client = _s3_client()
    counts = Counts()
    last_id = None

    async with async_session_maker() as session:
        while True:
            query = select(Recipe.id, Recipe.thumbnail_url).where(Recipe.thumbnail_url.is_not(None)).order_by(Recipe.id).limit(batch_size)
            if last_id is not None:
                query = query.where(Recipe.id > last_id)
            rows = (await session.execute(query)).all()
            if not rows:
                break
            last_id = rows[-1].id

            for row in rows:
                key = _key_for(row.thumbnail_url)
                if key is None:
                    counts.skipped += 1
                    continue
                await _process(client, key, dry_run, counts)

    label = "would_create" if dry_run else "created"
    print(f"{label}={counts.created} skipped={counts.skipped} failed={counts.failed}")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(description="Create missing _sm thumbnail variants for R2-hosted recipe thumbnails.")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(max(1, args.batch_size), args.dry_run))
