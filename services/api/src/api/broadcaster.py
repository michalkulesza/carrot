"""
In-memory pub/sub broadcaster for Shopping List real-time updates.

Single-worker design: asyncio queues + an in-memory presence registry.
To scale to multiple workers, swap internals for Postgres LISTEN/NOTIFY
or Redis pub/sub — the interface (subscribe/unsubscribe/publish/presence)
stays identical so routes never change.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

PRESENCE_TTL_SECONDS = 15
_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
]


def _user_color(user_id: uuid.UUID) -> str:
    h = int(str(user_id).replace("-", ""), 16)
    return _COLORS[h % len(_COLORS)]


class Broadcaster:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._presence: dict[str, dict[str, dict]] = {}

    # ── pub/sub ──────────────────────────────────────────────────────────────

    async def subscribe(self, scope: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(scope, set()).add(q)
        return q

    def unsubscribe(self, scope: str, q: asyncio.Queue) -> None:
        self._subs.get(scope, set()).discard(q)

    async def publish(self, scope: str, event: dict) -> None:
        for q in list(self._subs.get(scope, [])):
            await q.put(event)

    # ── presence ─────────────────────────────────────────────────────────────

    def set_presence(
        self,
        scope: str,
        user_id: uuid.UUID,
        nickname: str,
        item_id: uuid.UUID | None,
    ) -> None:
        entry = {
            "user_id": str(user_id),
            "nickname": nickname,
            "color": _user_color(user_id),
            "item_id": str(item_id) if item_id else None,
            "expires_at": datetime.now(tz=timezone.utc)
            + timedelta(seconds=PRESENCE_TTL_SECONDS),
        }
        self._presence.setdefault(scope, {})[str(user_id)] = entry

    def clear_presence(self, scope: str, user_id: uuid.UUID) -> None:
        self._presence.get(scope, {}).pop(str(user_id), None)

    def get_presence(self, scope: str) -> list[dict]:
        now = datetime.now(tz=timezone.utc)
        bucket = self._presence.get(scope, {})
        stale = [uid for uid, p in list(bucket.items()) if p["expires_at"] < now]
        for uid in stale:
            del bucket[uid]
        return [
            {k: v for k, v in p.items() if k != "expires_at"}
            for p in bucket.values()
        ]

    def is_locked_by_other(
        self, scope: str, item_id: uuid.UUID, requesting_user_id: uuid.UUID
    ) -> bool:
        """True if another user currently holds an edit-presence lock on item_id."""
        for p in self.get_presence(scope):
            if p["item_id"] == str(item_id) and p["user_id"] != str(requesting_user_id):
                return True
        return False


broadcaster = Broadcaster()
