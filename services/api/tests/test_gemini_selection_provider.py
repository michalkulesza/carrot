"""Exercise the async provider boundary without making Gemini requests."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from api.config import Settings
from api.services import gemini
from api.services.extraction_v2.contracts import ExtractionInput
from api.services.extraction_v2.gemini_selection import GeminiTextSelectionProvider, index_text_lines


def source():
    return index_text_lines(ExtractionInput(content="salt to taste", evidence_ids=["opaque"]))


def client(monkeypatch, effect):
    aio = AsyncMock()
    aio.__aenter__.return_value = aio
    aio.models.generate_content = AsyncMock(side_effect=effect)
    monkeypatch.setattr(gemini, "_build_client", Mock(return_value=SimpleNamespace(aio=aio)))
    return aio


def response(payload):
    return SimpleNamespace(
        text=json.dumps(payload),
        usage_metadata=SimpleNamespace(prompt_token_count=20, candidates_token_count=10),
    )


@pytest.mark.asyncio
async def test_provider_uses_requested_model_schema_and_bounded_sdk_retry(monkeypatch):
    assert Settings.model_fields["gemini_text_selection_model"].default == "gemini-3.1-flash-lite"
    monkeypatch.setattr(gemini.settings, "gemini_text_selection_model", "gemini-3.1-flash-lite")
    aio = client(monkeypatch, [response({"components": [{"ingredient_line_ids": ["line:1"]}]})])
    usage = gemini.UsageTracker()

    result = await GeminiTextSelectionProvider(usage=usage).select(source())

    assert result.components[0].ingredient_line_ids == ["line:1"]
    args = aio.models.generate_content.call_args.kwargs
    assert args["model"] == "gemini-3.1-flash-lite"
    assert json.loads(args["contents"])["lines"] == [{"id": "line:1", "text": "salt to taste"}]
    assert "additionalProperties" not in json.dumps(args["config"].response_schema)
    assert args["config"].http_options.retry_options.attempts == 1
    assert args["config"].http_options.timeout == 20000
    assert (usage.calls, usage.input_tokens, usage.output_tokens) == (1, 20, 10)
    aio.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_timeout_cancels_async_request_and_closes_client(monkeypatch):
    cancelled = asyncio.Event()

    async def blocked(**kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    aio = client(monkeypatch, blocked)
    with pytest.raises(TimeoutError):
        await GeminiTextSelectionProvider(timeout_seconds=0.01).select(source())

    assert cancelled.is_set()
    aio.models.generate_content.assert_awaited_once()
    aio.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("recover", [False, True])
async def test_transient_retry_is_bounded_to_two_requests(monkeypatch, recover):
    effects = [RuntimeError("503"), response({}) if recover else RuntimeError("503")]
    aio = client(monkeypatch, effects)
    if recover:
        assert (await GeminiTextSelectionProvider().select(source())).components == []
    else:
        with pytest.raises(RuntimeError):
            await GeminiTextSelectionProvider().select(source())
    assert aio.models.generate_content.await_count == 2
    aio.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_malformed_model_response_is_rejected_after_client_closes(monkeypatch):
    aio = client(monkeypatch, [response({"invented_ingredients": ["sugar"]})])
    with pytest.raises(ValueError):
        await GeminiTextSelectionProvider().select(source())
    aio.models.generate_content.assert_awaited_once()
    aio.__aexit__.assert_awaited_once()
