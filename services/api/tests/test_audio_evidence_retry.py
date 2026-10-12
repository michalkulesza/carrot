"""Audio-evidence extraction sizes its request timeout and retries transient failures."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from api.services import gemini


def client(monkeypatch, effect):
    aio = AsyncMock()
    aio.__aenter__.return_value = aio
    aio.models.generate_content = AsyncMock(side_effect=effect)
    monkeypatch.setattr(gemini, "_build_client", Mock(return_value=SimpleNamespace(aio=aio)))
    sleep = AsyncMock()
    monkeypatch.setattr(gemini.asyncio, "sleep", sleep)
    return aio, sleep


def ok():
    return SimpleNamespace(
        text=json.dumps({"components": [{"name": None, "ingredients": [], "steps": ["Cook."]}]}),
        usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=1),
    )


class CodedError(Exception):
    def __init__(self, code: int) -> None:
        super().__init__(f"{code} error")
        self.code = code


def test_request_timeout_scales_with_transcript_and_is_capped() -> None:
    assert gemini.audio_evidence_request_seconds(0) == 20
    assert gemini.audio_evidence_request_seconds(1792) == pytest.approx(37.92)
    assert gemini.audio_evidence_request_seconds(100_000) == 40
    # Two capped attempts plus backoff fit in the default budget.
    assert 2 * 40 + 1 < gemini._AUDIO_EVIDENCE_BUDGET_SECONDS


@pytest.mark.asyncio
async def test_long_transcript_gets_scaled_request_timeout(monkeypatch) -> None:
    aio, _ = client(monkeypatch, [ok()])

    await gemini.extract_audio_recipe_evidence("x" * 1792, {"components": []})

    assert aio.models.generate_content.call_args.kwargs["config"].http_options.timeout == 37920


@pytest.mark.asyncio
async def test_transient_504_then_success_returns_steps(monkeypatch) -> None:
    aio, sleep = client(monkeypatch, [RuntimeError("504 DEADLINE_EXCEEDED"), ok()])

    result = await gemini.extract_audio_recipe_evidence("Cook.", {"components": []})

    assert result.components[0].steps == ["Cook."]
    assert aio.models.generate_content.await_count == 2
    sleep.assert_awaited_once_with(1)


@pytest.mark.asyncio
async def test_two_transient_failures_still_succeed_within_budget(monkeypatch) -> None:
    aio, sleep = client(monkeypatch, [CodedError(503), TimeoutError(), ok()])

    result = await gemini.extract_audio_recipe_evidence("Cook.", {"components": []})

    assert result.components[0].steps == ["Cook."]
    assert aio.models.generate_content.await_count == 3
    assert [call.args[0] for call in sleep.await_args_list] == [1, 2]


@pytest.mark.asyncio
async def test_transient_failures_stop_after_max_attempts(monkeypatch) -> None:
    aio, _ = client(monkeypatch, [RuntimeError("504 DEADLINE_EXCEEDED")] * 3)

    with pytest.raises(RuntimeError, match="504"):
        await gemini.extract_audio_recipe_evidence("Cook.", {"components": []})

    assert aio.models.generate_content.await_count == 3


@pytest.mark.asyncio
async def test_non_transient_error_is_not_retried(monkeypatch) -> None:
    aio, sleep = client(monkeypatch, [CodedError(400)])

    with pytest.raises(CodedError):
        await gemini.extract_audio_recipe_evidence("Cook.", {"components": []})

    aio.models.generate_content.assert_awaited_once()
    sleep.assert_not_awaited()
