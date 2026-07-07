from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator, Callable, Awaitable
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from api.models import (
    ImportDebugUsage,
    ImportMetadata,
    ImportResult,
    ImportStage,
    RecipeExtraction,
)
from api.services import cache as cache_svc
from api.services import gemini as gemini_svc
from api.services.scraper import ReelMetadata, scraper

log = logging.getLogger(__name__)

# Stable error code sent to the client instead of raw exception text (network
# errors, HTTP status details, etc. shouldn't leak into the UI). The frontend
# maps this to a translated, actionable message.
IMPORT_ERROR_CODE = "extraction_failed"


async def _run_gemini(
    coro_factory: Callable[[Callable[[], Awaitable[None]]], Any],
    hd_emitted: list[bool],
    result_out: list,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Async generator wrapper around a Gemini coroutine.
    Polls every 50ms and yields {"type": "high_demand"} in real-time the first time
    on_hd fires during a _with_retry sleep — before the coroutine returns.
    Appends the result to result_out when done (or raises if the coroutine raised).
    """
    hd_event = asyncio.Event()

    async def on_hd() -> None:
        if not hd_emitted:
            hd_event.set()

    task = asyncio.create_task(coro_factory(on_hd))
    try:
        while True:
            if hd_event.is_set() and not hd_emitted:
                hd_emitted.append(True)
                yield {"type": "high_demand"}
            if task.done():
                break
            await asyncio.sleep(0.05)
    except (asyncio.CancelledError, GeneratorExit):
        task.cancel()
        raise
    result_out.append(task.result())  # propagates task exception if failed


def _is_complete(recipe: RecipeExtraction) -> bool:
    return any(c.ingredients and c.steps for c in recipe.components)


def _find_jsonld_recipe(html: str) -> dict | None:
    """Returns the raw schema.org Recipe dict from a page's JSON-LD, if present."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if item.get("@type") == "Recipe":
                return item
    return None


def _jsonld_recipe_steps(data: dict) -> list[str]:
    steps: list[str] = []
    for s in data.get("recipeInstructions", []):
        if isinstance(s, str) and s.strip():
            steps.append(s)
        elif isinstance(s, dict) and s.get("text", "").strip():
            steps.append(s["text"])
    return steps


def _jsonld_recipe_is_complete(data: dict) -> bool:
    ingredients = [i for i in data.get("recipeIngredient", []) if isinstance(i, str) and i.strip()]
    return bool(ingredients) and bool(_jsonld_recipe_steps(data))


def _jsonld_recipe_to_text(data: dict) -> str:
    """Renders a schema.org Recipe dict as clean text for Gemini to extract from —
    more reliable input than raw scraped page HTML since it's already structured."""
    lines = []
    if data.get("name"):
        lines.append(f"Title: {data['name']}")
    if data.get("recipeYield"):
        lines.append(f"Servings: {data['recipeYield']}")
    ingredients = [i for i in data.get("recipeIngredient", []) if isinstance(i, str) and i.strip()]
    if ingredients:
        lines.append("Ingredients:")
        lines.extend(f"- {i}" for i in ingredients)
    steps = _jsonld_recipe_steps(data)
    if steps:
        lines.append("Instructions:")
        lines.extend(f"{i + 1}. {s}" for i, s in enumerate(steps))
    calories = (data.get("nutrition") or {}).get("calories")
    if calories:
        lines.append(f"Calories: {calories} per serving")
    return "\n".join(lines)


def _is_social_url(url: str) -> bool:
    return "tiktok.com" in url or "instagram.com" in url


_NOISE_TAGS = ["script", "style", "nav", "header", "footer", "aside",
               "iframe", "noscript", "svg", "form", "button"]
_NOISE_ATTRS = ("comment", "newsletter", "sidebar", "cookie", "popup",
                "advertisement", "promo", "share", "related", "subscription")


def _strip_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    for el in list(soup.find_all(True)):
        if not el.attrs:
            continue
        combined = " ".join(el.get("class") or []).lower() + " " + (el.get("id") or "").lower()
        if any(p in combined for p in _NOISE_ATTRS):
            el.decompose()

    # Prefer the most recipe-relevant container over the full body
    container = (
        soup.find(class_=lambda c: c and any("recipe" in cls.lower() for cls in c))
        or soup.find("article")
        or soup.find("main")
        or soup.body
        or soup
    )

    return container.get_text(separator="\n", strip=True)[:4000]



async def _try_linked_url(
    url: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
    on_high_demand: Callable[[], Awaitable[None]] | None = None,
    usage: gemini_svc.UsageTracker | None = None,
) -> RecipeExtraction | None:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            html = r.text
    except Exception as exc:
        log.warning("Failed to fetch linked URL %s: %s", url, exc)
        return None

    jsonld = _find_jsonld_recipe(html)
    if jsonld and _jsonld_recipe_is_complete(jsonld):
        source_text = _jsonld_recipe_to_text(jsonld)
    else:
        source_text = _strip_html(html)
        if len(source_text) < 50:
            return None

    result = await gemini_svc.extract_recipe(
        source_text, source_hint="webpage", model=model,
        available_tags=available_tags, allergens=allergens,
        on_high_demand=on_high_demand, usage=usage,
    )
    return result if _is_complete(result) else None


def _stage_event(key: str, label: str) -> dict[str, Any]:
    return {"type": "stage", "key": key, "label": label}


def _done_event(result: ImportResult, cache_key: str | None = None) -> dict[str, Any]:
    if cache_key and result.stage != ImportStage.FAILED:
        cache_svc.set(cache_key, result)
    return {"type": "done", "result": result.model_dump()}


def _ingredient_display(ing: Ingredient) -> str:
    parts = [p for p in [ing.qty, ing.unit, ing.name, f"({ing.note})" if ing.note else None] if p]
    return " ".join(parts) if parts else ing.name


async def _with_allergens(
    result: ImportResult,
    allergens: list[str] | None,
    usage: gemini_svc.UsageTracker | None = None,
) -> ImportResult:
    """Attach allergen flags to a successfully extracted recipe."""
    if not allergens or not result.recipe:
        return result
    updated = []
    for component in result.recipe.components:
        names = [_ingredient_display(i) for i in component.ingredients]
        flags = await gemini_svc.analyze_allergens(names, allergens, usage=usage)
        new_ingredients = [
            ing.model_copy(update={"allergen": f.allergen, "substitute": f.substitute})
            for ing, f in zip(component.ingredients, flags)
        ]
        updated.append(component.model_copy(update={"ingredients": new_ingredients}))
    recipe = result.recipe.model_copy(update={"components": updated})
    return result.model_copy(update={"recipe": recipe})


def _attach_debug(result: ImportResult, usage: gemini_svc.UsageTracker, model: str) -> ImportResult:
    """Attach aggregated token usage for every Gemini call made during this import."""
    if not usage.calls or result.stage == ImportStage.FAILED:
        return result
    debug = ImportDebugUsage(
        model=model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        total_tokens=usage.input_tokens + usage.output_tokens,
    )
    metadata = result.metadata.model_copy(update={"debug": debug})
    return result.model_copy(update={"metadata": metadata})


async def run_import_stream(url: str, model: str = "gemini-2.5-flash-lite", available_tags: list[str] | None = None, allergens: list[str] | None = None) -> AsyncGenerator[dict[str, Any], None]:
    if not allergens:
        cached = cache_svc.get(url)
        if cached is not None:
            log.debug("Cache hit for %s", url)
            yield _done_event(cached)
            return

    hd_emitted: list[bool] = []  # shared flag: high_demand already yielded this stream
    usage = gemini_svc.UsageTracker()

    if not _is_social_url(url):
        yield _stage_event("fetching_page", "Fetching recipe page…")
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                r.raise_for_status()
                html = r.text
        except Exception as exc:
            log.warning("Could not fetch page %s: %s", url, exc)
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED,
                metadata=ImportMetadata(source_url=url),
                error=IMPORT_ERROR_CODE,
            ))
            return

        soup = BeautifulSoup(html, "html.parser")
        og_tag = soup.find("meta", attrs={"property": "og:image"})
        thumbnail_url: str | None = og_tag.get("content") if og_tag else None  # type: ignore[union-attr]
        domain = urlparse(url).netloc.removeprefix("www.")
        meta = ImportMetadata(source_url=url, thumbnail_url=thumbnail_url, creator_handle=domain)

        jsonld = _find_jsonld_recipe(html)
        if jsonld and _jsonld_recipe_is_complete(jsonld):
            # Structured JSON-LD is cleaner and more reliable input than scraped
            # page text, but tags/macros/qty-unit-note parsing still only ever
            # come from Gemini — JSON-LD carries none of that.
            source_text = _jsonld_recipe_to_text(jsonld)
            stage = ImportStage.LINK
        else:
            source_text = _strip_html(html)
            stage = ImportStage.TRANSCRIPT

        yield _stage_event("analyzing_page", "Analyzing page with Gemini…")
        try:
            result_out: list = []
            async for _ev in _run_gemini(
                lambda on_hd: gemini_svc.extract_recipe(
                    source_text, source_hint="webpage", model=model,
                    available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd, usage=usage,
                ),
                hd_emitted, result_out,
            ):
                yield _ev
            result = result_out[0]
            if _is_complete(result):
                r = ImportResult(stage=stage, recipe=result, metadata=meta)
                yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model), cache_key=url)
            else:
                yield _done_event(ImportResult(
                    stage=ImportStage.FAILED,
                    metadata=meta,
                    error=IMPORT_ERROR_CODE,
                ))
        except Exception as exc:
            log.warning("Gemini extraction failed for %s: %s", url, exc)
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED,
                metadata=meta,
                error=IMPORT_ERROR_CODE,
            ))
        return

    yield _stage_event("fetching_metadata", "Fetching reel metadata…")

    try:
        metadata: ReelMetadata = await scraper.fetch_reel(url)
    except Exception as exc:
        log.warning("Could not fetch reel %s: %s", url, exc)
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED,
            metadata=ImportMetadata(source_url=url),
            error=IMPORT_ERROR_CODE,
        ))
        return

    meta = ImportMetadata(
        source_url=metadata.source_url,
        creator_handle=metadata.creator_handle,
        thumbnail_url=metadata.thumbnail_url,
    )

    # Stage 1 — description
    if metadata.description.strip():
        yield _stage_event("checking_description", "Checking caption with Gemini…")
        try:
            result_out_desc: list = []
            async for _ev in _run_gemini(
                lambda on_hd: gemini_svc.extract_recipe(
                    metadata.description, source_hint="instagram/tiktok caption",
                    model=model, available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd, usage=usage,
                ),
                hd_emitted, result_out_desc,
            ):
                yield _ev
            result = result_out_desc[0]
            if _is_complete(result):
                r = ImportResult(stage=ImportStage.DESCRIPTION, recipe=result, metadata=meta)
                yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model), cache_key=url)
                return
        except Exception as exc:
            log.warning("Gemini description stage failed: %s", exc)

    # Stage 2 — linked URLs
    for link in metadata.linked_urls[:3]:
        yield _stage_event("checking_links", "Checking linked page…")
        try:
            result = await _try_linked_url(
                link, model=model, available_tags=available_tags, allergens=allergens,
                on_high_demand=None,  # skip hd detection for linked pages
                usage=usage,
            )
            if result and _is_complete(result):
                r = ImportResult(stage=ImportStage.LINK, recipe=result, metadata=meta)
                yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model), cache_key=url)
                return
        except Exception as exc:
            log.warning("Link stage failed for %s: %s", link, exc)

    # Stage 3 — transcript
    yield _stage_event("fetching_transcript", "Fetching video transcript…")
    try:
        transcript = await scraper.fetch_transcript(url)
        if transcript.strip():
            yield _stage_event("analyzing_transcript", "Analyzing transcript with Gemini…")
            result_out_tr: list = []
            async for _ev in _run_gemini(
                lambda on_hd: gemini_svc.extract_recipe(
                    transcript, source_hint="video transcript", model=model,
                    available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd, usage=usage,
                ),
                hd_emitted, result_out_tr,
            ):
                yield _ev
            result = result_out_tr[0]
            log.debug("Transcript extraction result: title=%r components=%d", result.title, len(result.components))
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model), cache_key=url)
            return
    except Exception as exc:
        log.warning("Transcription stage failed: %s", exc)

    yield _done_event(ImportResult(
        stage=ImportStage.FAILED,
        metadata=meta,
        error=IMPORT_ERROR_CODE,
    ))


async def run_text_import_stream(
    text: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    yield _stage_event("analyzing_text", "Analyzing recipe text with Gemini…")
    meta = ImportMetadata()
    hd_emitted: list[bool] = []
    usage = gemini_svc.UsageTracker()
    try:
        result_out_txt: list = []
        async for _ev in _run_gemini(
            lambda on_hd: gemini_svc.extract_recipe(
                text[:6000], source_hint="pasted text", model=model,
                available_tags=available_tags, allergens=allergens,
                on_high_demand=on_hd, usage=usage,
            ),
            hd_emitted, result_out_txt,
        ):
            yield _ev
        result = result_out_txt[0]
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model))
        else:
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED, metadata=meta,
                error="Could not extract a recipe from this text.",
            ))
    except Exception as exc:
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED, metadata=meta,
            error=f"Gemini extraction failed: {exc}",
        ))


async def run_image_import_stream(
    image_data: bytes,
    mime_type: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    yield _stage_event("analyzing_image", "Analyzing image with Gemini Vision…")
    meta = ImportMetadata()
    hd_emitted: list[bool] = []
    usage = gemini_svc.UsageTracker()
    try:
        result_out_img: list = []
        async for _ev in _run_gemini(
            lambda on_hd: gemini_svc.extract_recipe_from_image(
                image_data, mime_type=mime_type, model=model,
                available_tags=available_tags, allergens=allergens,
                on_high_demand=on_hd, usage=usage,
            ),
            hd_emitted, result_out_img,
        ):
            yield _ev
        result = result_out_img[0]
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(_attach_debug(await _with_allergens(r, allergens, usage), usage, model))
        else:
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED, metadata=meta,
                error="Could not extract a recipe from this image.",
            ))
    except Exception as exc:
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED, metadata=meta,
            error=f"Gemini image extraction failed: {exc}",
        ))


async def run_import(url: str, model: str = "gemini-2.5-flash-lite") -> ImportResult:
    result: ImportResult | None = None
    async for event in run_import_stream(url, model=model):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    assert result is not None
    return result


async def run_image_import(
    image_data: bytes,
    mime_type: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> ImportResult:
    result: ImportResult | None = None
    async for event in run_image_import_stream(
        image_data, mime_type, model=model, available_tags=available_tags, allergens=allergens,
    ):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    assert result is not None
    return result


async def run_url_import(
    url: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> ImportResult:
    result: ImportResult | None = None
    async for event in run_import_stream(url, model=model, available_tags=available_tags, allergens=allergens):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    assert result is not None
    return result


async def run_text_import(
    text: str,
    model: str = "gemini-2.5-flash-lite",
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> ImportResult:
    result: ImportResult | None = None
    async for event in run_text_import_stream(text, model=model, available_tags=available_tags, allergens=allergens):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    assert result is not None
    return result
