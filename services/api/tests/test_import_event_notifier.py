import asyncio

import pytest

from api.import_event_notifier import ImportEventNotifier


@pytest.mark.asyncio
async def test_wait_times_out_without_notification() -> None:
    notifier = ImportEventNotifier()

    await asyncio.wait_for(notifier.wait(notifier.generation, timeout=0.05), timeout=1)


@pytest.mark.asyncio
async def test_wait_returns_promptly_after_notify() -> None:
    notifier = ImportEventNotifier()
    waiter = asyncio.create_task(notifier.wait(notifier.generation, timeout=30))
    await asyncio.sleep(0)

    await notifier.notify()

    await asyncio.wait_for(waiter, timeout=1)


@pytest.mark.asyncio
async def test_notify_between_poll_and_wait_is_not_lost() -> None:
    notifier = ImportEventNotifier()
    generation = notifier.generation

    await notifier.notify()

    await asyncio.wait_for(notifier.wait(generation, timeout=30), timeout=1)


@pytest.mark.asyncio
async def test_notify_wakes_every_waiter() -> None:
    notifier = ImportEventNotifier()
    waiters = [asyncio.create_task(notifier.wait(notifier.generation, timeout=30)) for _ in range(3)]
    await asyncio.sleep(0)

    notifier._on_notification()

    await asyncio.wait_for(asyncio.gather(*waiters), timeout=1)
