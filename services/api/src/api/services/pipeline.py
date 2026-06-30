from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator, Callable, Awaitable
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from api.models import (
    ImportMetadata,
    ImportResult,
    ImportStage,
    Ingredient,
    RecipeComponent,
    RecipeExtraction,
)
from api.services import cache as cache_svc
from api.services import gemini as gemini_svc
from api.services.scraper import ReelMetadata, scraper

log = logging.getLogger(__name__)


async def _gemini_task(
    coro_factory: Callable[[Callable[[], Awaitable[None]]], Any],
    hd_emitted: list[bool],
) -> tuple[Any, bool]:
    """
    Run a Gemini coroutine (created by coro_factory(on_hd_callback)) as a task.
    Yields high_demand detection: returns (result, newly_detected).
    The task polls every 50ms so the high_demand signal fires during _with_retry sleep.
    """
    flag: list[bool] = []

    async def on_hd() -> None:
        if not flag:
            flag.append(True)

    task = asyncio.create_task(coro_factory(on_hd))
    try:
        while not task.done():
            await asyncio.sleep(0.05)
    except (asyncio.CancelledError, GeneratorExit):
        task.cancel()
        raise

    newly_detected = bool(flag) and not hd_emitted
    return task.result(), newly_detected


def _is_complete(recipe: RecipeExtraction) -> bool:
    return any(c.ingredients and c.steps for c in recipe.components)


def _extract_jsonld_recipe(html: str) -> RecipeExtraction | None:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if item.get("@type") == "Recipe":
                return _jsonld_to_extraction(item)
    return None


def _jsonld_to_extraction(data: dict) -> RecipeExtraction:
    ingredients = [
        Ingredient(name=line)
        for line in data.get("recipeIngredient", [])
        if line.strip()
    ]
    steps: list[str] = []
    for s in data.get("recipeInstructions", []):
        if isinstance(s, str):
            steps.append(s)
        elif isinstance(s, dict):
            steps.append(s.get("text", ""))

    servings_raw = data.get("recipeYield")
    servings: int | None = None
    if isinstance(servings_raw, int):
        servings = servings_raw
    elif isinstance(servings_raw, str):
        try:
            servings = int("".join(c for c in servings_raw if c.isdigit()) or "0") or None
        except ValueError:
            pass

    kcal: int | None = None
    calories_raw = (data.get("nutrition") or {}).get("calories")
    if calories_raw:
        m = re.search(r"\d+", str(calories_raw))
        if m:
            kcal = int(m.group())

    component = RecipeComponent(role="main", ingredients=ingredients, steps=steps)
    return RecipeExtraction(
        title=data.get("name"),
        servings=servings,
        kcal_per_serving=kcal,
        components=[component] if (ingredients or steps) else [],
    )


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
) -> RecipeExtraction | None:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            html = r.text
    except Exception as exc:
        log.warning("Failed to fetch linked URL %s: %s", url, exc)
        return None

    jsonld = _extract_jsonld_recipe(html)
    if jsonld and _is_complete(jsonld):
        return jsonld

    page_text = _strip_html(html)
    if len(page_text) < 50:
        return None

    result = await gemini_svc.extract_recipe(
        page_text, source_hint="webpage", model=model,
        available_tags=available_tags, allergens=allergens,
        on_high_demand=on_high_demand,
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


async def _with_allergens(result: ImportResult, allergens: list[str] | None) -> ImportResult:
    """Attach allergen flags to a successfully extracted recipe."""
    if not allergens or not result.recipe:
        return result
    updated = []
    for component in result.recipe.components:
        names = [_ingredient_display(i) for i in component.ingredients]
        flags = await gemini_svc.analyze_allergens(names, allergens)
        new_ingredients = [
            ing.model_copy(update={"allergen": f.allergen, "substitute": f.substitute})
            for ing, f in zip(component.ingredients, flags)
        ]
        updated.append(component.model_copy(update={"ingredients": new_ingredients}))
    recipe = result.recipe.model_copy(update={"components": updated})
    return result.model_copy(update={"recipe": recipe})


async def run_import_stream(url: str, model: str = "gemini-2.5-flash-lite", available_tags: list[str] | None = None, allergens: list[str] | None = None) -> AsyncGenerator[dict[str, Any], None]:
    if not allergens:
        cached = cache_svc.get(url)
        if cached is not None:
            log.debug("Cache hit for %s", url)
            yield _done_event(cached)
            return

    hd_emitted: list[bool] = []  # shared flag: high_demand already yielded this stream

    if not _is_social_url(url):
        yield _stage_event("fetching_page", "Fetching recipe page…")
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                r.raise_for_status()
                html = r.text
        except Exception as exc:
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED,
                metadata=ImportMetadata(source_url=url),
                error=f"Could not fetch page: {exc}",
            ))
            return

        soup = BeautifulSoup(html, "html.parser")
        og_tag = soup.find("meta", attrs={"property": "og:image"})
        thumbnail_url: str | None = og_tag.get("content") if og_tag else None  # type: ignore[union-attr]
        domain = urlparse(url).netloc.removeprefix("www.")
        meta = ImportMetadata(source_url=url, thumbnail_url=thumbnail_url, creator_handle=domain)

        jsonld = _extract_jsonld_recipe(html)
        if jsonld and _is_complete(jsonld) and jsonld.kcal_per_serving is not None:
            r = ImportResult(stage=ImportStage.LINK, recipe=jsonld, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens), cache_key=url)
            return

        yield _stage_event("analyzing_page", "Analyzing page with Gemini…")
        page_text = _strip_html(html)
        try:
            result, hd_new = await _gemini_task(
                lambda on_hd: gemini_svc.extract_recipe(
                    page_text, source_hint="webpage", model=model,
                    available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd,
                ),
                hd_emitted,
            )
            if hd_new:
                hd_emitted.append(True)
                yield {"type": "high_demand"}
            if jsonld and _is_complete(jsonld):
                jsonld = jsonld.model_copy(update={"kcal_per_serving": result.kcal_per_serving})
                r = ImportResult(stage=ImportStage.LINK, recipe=jsonld, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens), cache_key=url)
            elif _is_complete(result):
                r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens), cache_key=url)
            else:
                yield _done_event(ImportResult(
                    stage=ImportStage.FAILED,
                    metadata=meta,
                    error="Could not extract a recipe from this page.",
                ))
        except Exception as exc:
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED,
                metadata=meta,
                error=f"Gemini extraction failed: {exc}",
            ))
        return

    yield _stage_event("fetching_metadata", "Fetching reel metadata…")

    try:
        metadata: ReelMetadata = await scraper.fetch_reel(url)
    except Exception as exc:
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED,
            metadata=ImportMetadata(source_url=url),
            error=f"Could not fetch reel: {exc}",
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
            result, hd_new = await _gemini_task(
                lambda on_hd: gemini_svc.extract_recipe(
                    metadata.description, source_hint="instagram/tiktok caption",
                    model=model, available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd,
                ),
                hd_emitted,
            )
            if hd_new:
                hd_emitted.append(True)
                yield {"type": "high_demand"}
            if _is_complete(result):
                r = ImportResult(stage=ImportStage.DESCRIPTION, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens), cache_key=url)
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
            )
            if result and _is_complete(result):
                r = ImportResult(stage=ImportStage.LINK, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens), cache_key=url)
                return
        except Exception as exc:
            log.warning("Link stage failed for %s: %s", link, exc)

    # Stage 3 — transcript
    yield _stage_event("fetching_transcript", "Fetching video transcript…")
    try:
        transcript = await scraper.fetch_transcript(url)
        if transcript.strip():
            yield _stage_event("analyzing_transcript", "Analyzing transcript with Gemini…")
            result, hd_new = await _gemini_task(
                lambda on_hd: gemini_svc.extract_recipe(
                    transcript, source_hint="video transcript", model=model,
                    available_tags=available_tags, allergens=allergens,
                    on_high_demand=on_hd,
                ),
                hd_emitted,
            )
            if hd_new:
                hd_emitted.append(True)
                yield {"type": "high_demand"}
            log.debug("Transcript extraction result: title=%r components=%d", result.title, len(result.components))
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens), cache_key=url)
            return
    except Exception as exc:
        log.warning("Transcription stage failed: %s", exc)

    yield _done_event(ImportResult(
        stage=ImportStage.FAILED,
        metadata=meta,
        error="Could not extract a recipe from this reel.",
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
    try:
        result, hd_new = await _gemini_task(
            lambda on_hd: gemini_svc.extract_recipe(
                text[:6000], source_hint="pasted text", model=model,
                available_tags=available_tags, allergens=allergens,
                on_high_demand=on_hd,
            ),
            hd_emitted,
        )
        if hd_new:
            yield {"type": "high_demand"}
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens))
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
    try:
        result, hd_new = await _gemini_task(
            lambda on_hd: gemini_svc.extract_recipe_from_image(
                image_data, mime_type=mime_type, model=model,
                available_tags=available_tags, allergens=allergens,
                on_high_demand=on_hd,
            ),
            hd_emitted,
        )
        if hd_new:
            yield {"type": "high_demand"}
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens))
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
