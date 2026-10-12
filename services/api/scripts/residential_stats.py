"""Read-only stats on URL imports that used the residential egress fallback.

Usage: uv run --no-sync python scripts/residential_stats.py [--days N]
"""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from sqlalchemy import func, select

import api.users  # noqa: F401 - registers User so all mappers configure
from api.database import async_session_maker
from api.models import ImportJob, ImportJobKind, Recipe


def _host(url: str | None) -> str | None:
    return (urlsplit(url).hostname or None) if url else None


async def fetch_stats(session, days: int = 30, now: datetime | None = None) -> dict:
    since = (now or datetime.utcnow()) - timedelta(days=days)
    in_window = (ImportJob.kind == ImportJobKind.URL, ImportJob.created_at >= since)
    total = await session.scalar(select(func.count()).select_from(ImportJob).where(*in_window)) or 0
    rows = (await session.execute(
        select(ImportJob.created_at, ImportJob.residential_step, ImportJob.residential_outcome,
               ImportJob.input, Recipe.source_url)
        .outerjoin(Recipe, Recipe.id == ImportJob.result_recipe_id)
        .where(*in_window, ImportJob.residential_step.is_not(None))
    )).all()
    hosts = Counter(_host((input_ or {}).get("url") if isinstance(input_, dict) else None) or _host(source_url)
                    for _, _, _, input_, source_url in rows)
    hosts.pop(None, None)
    ok = sum(1 for row in rows if row.residential_outcome == "ok")
    return {
        "days": days,
        "total_url_imports": total,
        "residential_attempts": len(rows),
        "by_outcome": dict(Counter(row.residential_outcome for row in rows)),
        "by_step": dict(Counter(row.residential_step for row in rows)),
        "success_rate": (ok / len(rows)) if rows else None,
        "per_day": dict(sorted(Counter(row.created_at.date().isoformat() for row in rows).items())),
        "top_hosts": hosts.most_common(10),
    }


def _print(stats: dict) -> None:
    attempts = stats["residential_attempts"]
    print(f"Last {stats['days']} days")
    print(f"URL imports:          {stats['total_url_imports']}")
    print(f"Residential attempts: {attempts}")
    rate = stats["success_rate"]
    print(f"Success rate:         {'n/a' if rate is None else f'{rate:.1%}'}")
    for title, key in (("By outcome", "by_outcome"), ("By step", "by_step"), ("Per day", "per_day")):
        print(f"\n{title}:")
        for name, count in stats[key].items():
            print(f"  {name}: {count}")
    print("\nTop hosts:")
    for host, count in stats["top_hosts"]:
        print(f"  {host}: {count}")


async def main(days: int) -> None:
    async with async_session_maker() as session:
        _print(await fetch_stats(session, days))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30)
    asyncio.run(main(parser.parse_args().days))
