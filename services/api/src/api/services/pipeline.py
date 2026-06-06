from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
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

    for el in soup.find_all(True):
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


async def _estimate_kcal(recipe: RecipeExtraction, model: str) -> int | None:
    lines = [f"Recipe: {recipe.title or 'unknown dish'}"]
    if recipe.servings:
        lines.append(f"Servings: {recipe.servings}")
    lines.append("Ingredients:")
    for comp in recipe.components:
        for ing in comp.ingredients:
            lines.append("- " + " ".join(filter(None, [ing.qty, ing.unit, ing.name, ing.note])))
    try:
        result = await gemini_svc.extract_recipe("\n".join(lines), source_hint="kcal estimation", model=model)
        return result.kcal_per_serving
    except Exception as exc:
        log.warning("kcal estimation failed: %s", exc)
        return None


async def _try_linked_url(url: str, model: str = "gemini-2.5-flash-lite") -> RecipeExtraction | None:
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

    result = await gemini_svc.extract_recipe(page_text, source_hint="webpage", model=model)
    return result if _is_complete(result) else None


def _stage_event(key: str, label: str) -> dict[str, Any]:
    return {"type": "stage", "key": key, "label": label}


def _done_event(result: ImportResult, cache_key: str | None = None) -> dict[str, Any]:
    if cache_key and result.stage != ImportStage.FAILED:
        cache_svc.set(cache_key, result)
    return {"type": "done", "result": result.model_dump()}


async def run_import_stream(url: str, model: str = "gemini-2.5-flash-lite") -> AsyncGenerator[dict[str, Any], None]:
    cached = cache_svc.get(url)
    if cached is not None:
        log.debug("Cache hit for %s", url)
        yield _done_event(cached)
        return

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
        if jsonld and _is_complete(jsonld):
            if jsonld.kcal_per_serving is None:
                yield _stage_event("estimating_kcal", "Estimating calories…")
                kcal = await _estimate_kcal(jsonld, model)
                jsonld = jsonld.model_copy(update={"kcal_per_serving": kcal})
            yield _done_event(ImportResult(stage=ImportStage.LINK, recipe=jsonld, metadata=meta), cache_key=url)
            return

        yield _stage_event("analyzing_page", "Analyzing page with Gemini…")
        page_text = _strip_html(html)
        try:
            result = await gemini_svc.extract_recipe(page_text, source_hint="webpage", model=model)
            if _is_complete(result):
                yield _done_event(ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta), cache_key=url)
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
            result = await gemini_svc.extract_recipe(
                metadata.description, source_hint="instagram/tiktok caption", model=model
            )
            if _is_complete(result):
                yield _done_event(ImportResult(stage=ImportStage.DESCRIPTION, recipe=result, metadata=meta), cache_key=url)
                return
        except Exception as exc:
            log.warning("Gemini description stage failed: %s", exc)

    # Stage 2 — linked URLs
    for link in metadata.linked_urls[:3]:
        yield _stage_event("checking_links", f"Checking linked page…")
        try:
            result = await _try_linked_url(link, model=model)
            if result and _is_complete(result):
                yield _done_event(ImportResult(stage=ImportStage.LINK, recipe=result, metadata=meta), cache_key=url)
                return
        except Exception as exc:
            log.warning("Link stage failed for %s: %s", link, exc)

    # Stage 3 — transcript
    yield _stage_event("fetching_transcript", "Fetching video transcript…")
    try:
        transcript = await scraper.fetch_transcript(url)
        if transcript.strip():
            yield _stage_event("analyzing_transcript", "Analyzing transcript with Gemini…")
            result = await gemini_svc.extract_recipe(transcript, source_hint="video transcript", model=model)
            log.debug("Transcript extraction result: title=%r components=%d", result.title, len(result.components))
            # Last resort — return whatever Gemini found, even if partial
            yield _done_event(ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta), cache_key=url)
            return
    except Exception as exc:
        log.warning("Transcription stage failed: %s", exc)

    yield _done_event(ImportResult(
        stage=ImportStage.FAILED,
        metadata=meta,
        error="Could not extract a recipe from this reel.",
    ))


async def run_import(url: str, model: str = "gemini-2.5-flash-lite") -> ImportResult:
    result: ImportResult | None = None
    async for event in run_import_stream(url, model=model):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    assert result is not None
    return result
