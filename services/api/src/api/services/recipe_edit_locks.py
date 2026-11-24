import time
import uuid
from dataclasses import dataclass

LOCK_TTL_SECONDS = 15


@dataclass
class RecipeEditLock:
    user_id: uuid.UUID
    client_id: str | None
    nickname: str
    expires_at: float


class RecipeEditLocks:
    def __init__(self) -> None:
        self._locks: dict[uuid.UUID, RecipeEditLock] = {}

    def holder_other_than(
        self, recipe_id: uuid.UUID, user_id: uuid.UUID, client_id: str | None
    ) -> RecipeEditLock | None:
        lock = self._locks.get(recipe_id)
        if lock is None:
            return None
        if lock.expires_at < time.monotonic():
            del self._locks[recipe_id]
            return None
        if lock.user_id == user_id and lock.client_id == client_id:
            return None
        return lock

    def acquire(
        self, recipe_id: uuid.UUID, user_id: uuid.UUID, client_id: str | None, nickname: str
    ) -> None:
        self._locks[recipe_id] = RecipeEditLock(
            user_id=user_id,
            client_id=client_id,
            nickname=nickname,
            expires_at=time.monotonic() + LOCK_TTL_SECONDS,
        )

    def release(self, recipe_id: uuid.UUID, user_id: uuid.UUID, client_id: str | None) -> None:
        lock = self._locks.get(recipe_id)
        if lock is not None and lock.user_id == user_id and lock.client_id == client_id:
            del self._locks[recipe_id]

    def clear(self) -> None:
        self._locks.clear()


recipe_edit_locks = RecipeEditLocks()
