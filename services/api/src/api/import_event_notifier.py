import asyncio
import logging

import asyncpg
from sqlalchemy.engine import make_url

from api.config import settings

logger = logging.getLogger(__name__)

IMPORT_EVENTS_CHANNEL = "import_job_events"
MAX_BACKOFF_SECONDS = 30.0


class ImportEventNotifier:
    def __init__(self) -> None:
        self._generation = 0
        self._condition = asyncio.Condition()
        self._task: asyncio.Task | None = None
        self._pending: set[asyncio.Task] = set()

    @property
    def generation(self) -> int:
        return self._generation

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    async def wait(self, since: int, timeout: float) -> None:
        async with self._condition:
            try:
                await asyncio.wait_for(self._condition.wait_for(lambda: self._generation != since), timeout)
            except asyncio.TimeoutError:
                pass

    async def notify(self) -> None:
        async with self._condition:
            self._generation += 1
            self._condition.notify_all()

    def _on_notification(self, *_args) -> None:
        task = asyncio.create_task(self.notify())
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def _run(self) -> None:
        backoff = 1.0
        while True:
            connection = None
            try:
                dsn = make_url(settings.database_url).set(drivername="postgresql").render_as_string(hide_password=False)
                connection = await asyncpg.connect(dsn)
                closed = asyncio.Event()
                connection.add_termination_listener(lambda _conn: closed.set())
                await connection.add_listener(IMPORT_EVENTS_CHANNEL, self._on_notification)
                backoff = 1.0
                await self.notify()
                await closed.wait()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("import event listener unavailable, falling back to polling", exc_info=True)
            finally:
                if connection is not None and not connection.is_closed():
                    await asyncio.shield(connection.close())
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)


import_event_notifier = ImportEventNotifier()
