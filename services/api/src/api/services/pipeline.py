from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator, Awaitable
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession as CurlAsyncSession
import httpx

from api.models import (
    ImportMetadata,
    ImportResult,
    ImportStage,
    RecipeExtraction,
)
from api.services import cache as cache_svc
from api.services import gemini as gemini_svc
from api.services.monitoring import report_recipe_import_failure
from api.services.scraper import ReelMetadata, scraper
from api.services.transcription import transcribe_video

log = logging.getLogger(__name__)

# Stable error code sent to the client instead of raw exception text (network
# errors, HTTP status details, etc. shouldn't leak into the UI). The frontend
# maps this to a translated, actionable message.
IMPORT_ERROR_CODE = "extraction_failed"
USER_ACTION_REQUIRED_ERROR_CODE = "user_action_required"


# Reused across calls: opening a new CurlAsyncSession per request under
# concurrency caused severe contention (requests timing out after 15-30s that
# resolve in well under a second on a shared session).
_curl_session = CurlAsyncSession()


async def _fetch_html(url: str) -> str:
    # Recipe sites (notably Shopify-hosted ones like andy-cooks.com) fingerprint
    # the TLS handshake and block plain httpx/requests clients with a 429 even
    # with a browser User-Agent header, so impersonate a real Chrome client.
    r = await _curl_session.get(url, impersonate="chrome", timeout=15, allow_redirects=True)
    r.raise_for_status()
    return r.text


async def _run_gemini(
    coro: Awaitable[Any],
    result_out: list,
) -> AsyncGenerator[dict[str, Any], None]:
    result_out.append(await coro)
    if False:
        yield {}


def _is_complete(recipe: RecipeExtraction) -> bool:
    # Recipes with sub-headed ingredient sections (e.g. "For the paste",
    # "For the pork") but one shared instruction list get split by the
    # extraction model into ingredients-only and steps-only components —
    # neither has both, so check presence across the whole recipe instead of
    # requiring a single component to carry both.
    return (
        any(c.ingredients for c in recipe.components)
        and any(c.steps for c in recipe.components)
    )


def _find_jsonld_recipe(html: str) -> dict | None:
    """Returns the raw schema.org Recipe dict from a page's JSON-LD, if present."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        # Many SEO plugins (e.g. Yoast) nest all typed nodes under a shared
        # "@graph" array instead of exposing Recipe at the top level.
        items = [
            node
            for item in items
            for node in ((item.get("@graph") or [item]) if isinstance(item, dict) else [item])
        ]
        for item in items:
            if isinstance(item, dict) and item.get("@type") == "Recipe":
                return item
    return None


def _find_microdata_recipe(html: str) -> dict | None:
    """Returns a schema.org Recipe dict built from itemprop/itemscope microdata,
    for sites (e.g. oliveandmango.com) that don't emit JSON-LD. Normalized into
    the same shape as _find_jsonld_recipe's output so callers can't tell the two
    apart."""
    soup = BeautifulSoup(html, "html.parser")
    container = soup.find(attrs={"itemtype": lambda v: v and v.rstrip("/").endswith("/Recipe")})
    if container is None:
        return None

    def prop_texts(name: str) -> list[str]:
        texts = []
        for el in container.find_all(attrs={"itemprop": name}):
            text = el.get("content") or el.get_text(" ", strip=True)
            if text and text.strip():
                texts.append(text.strip())
        return texts

    def prop_text(name: str) -> str | None:
        texts = prop_texts(name)
        return texts[0] if texts else None

    ingredients = prop_texts("recipeIngredient") or prop_texts("ingredients")

    instructions: list[str] = []
    for el in container.find_all(attrs={"itemprop": "recipeInstructions"}):
        # Instructions are marked up either as one wrapper with nested
        # itemprop="text"/<li> steps, or as several repeated single-step
        # elements — handle both by falling back to the element's own text.
        steps = el.find_all(attrs={"itemprop": "text"}) or el.find_all("li")
        if steps:
            instructions.extend(s.get_text(" ", strip=True) for s in steps if s.get_text(strip=True))
        elif el.get_text(strip=True):
            instructions.append(el.get_text(" ", strip=True))

    if not ingredients or not instructions:
        return None

    calories = prop_text("calories")
    return {
        "name": prop_text("name"),
        "recipeYield": prop_text("recipeYield"),
        "totalTime": prop_text("totalTime"),
        "recipeIngredient": ingredients,
        "recipeInstructions": instructions,
        "nutrition": {"calories": calories} if calories else None,
    }


def _parse_kwestiasmaku(soup: BeautifulSoup) -> dict | None:
    # kwestiasmaku.com emits no schema.org markup at all; its Drupal template
    # groups ingredients and steps under fixed field-group class names.
    ingredients_container = soup.find(class_="group-skladniki")
    steps_container = soup.find(class_="group-przepis")
    if ingredients_container is None or steps_container is None:
        return None

    ingredients = [li.get_text(" ", strip=True) for li in ingredients_container.find_all("li")]
    ingredients = [i for i in ingredients if i]
    instructions = [li.get_text(" ", strip=True) for li in steps_container.find_all("li")]
    instructions = [s for s in instructions if s]
    if not ingredients or not instructions:
        return None

    title = soup.find("h1")
    return {
        "name": title.get_text(strip=True) if title else None,
        "recipeIngredient": ingredients,
        "recipeInstructions": instructions,
    }


def _parse_oliveandmango(soup: BeautifulSoup) -> dict | None:
    # oliveandmango.com marks up ingredients via microdata but leaves steps as
    # plain prose: a condensed 4-step overview followed by a "Directions"
    # heading with the real numbered list, both inside itemprop="text".
    container = soup.find(attrs={"itemtype": lambda v: v and v.rstrip("/").endswith("/Recipe")})
    if container is None:
        return None

    ingredients = [
        el.get_text(" ", strip=True)
        for el in container.find_all(attrs={"itemprop": "recipeIngredient"})
    ]
    ingredients = [i for i in ingredients if i]

    text_container = container.find(attrs={"itemprop": "text"}) or container
    heading = text_container.find(
        lambda tag: tag.name in ("h2", "h3") and re.search(r"directions|instructions|method", tag.get_text(), re.I)
    )
    ol = heading.find_next("ol") if heading else None
    if ol is None:
        ols = text_container.find_all("ol")
        ol = ols[-1] if ols else None
    instructions = [li.get_text(" ", strip=True) for li in ol.find_all("li", recursive=False)] if ol else []
    instructions = [s for s in instructions if s]
    if not ingredients or not instructions:
        return None

    name = container.find(attrs={"itemprop": "name"})
    return {
        "name": name.get_text(strip=True) if name else None,
        "recipeIngredient": ingredients,
        "recipeInstructions": instructions,
    }


_DOMAIN_PARSERS = {
    "kwestiasmaku.com": _parse_kwestiasmaku,
    "oliveandmango.com": _parse_oliveandmango,
}


def _find_domain_specific_recipe(url: str, html: str) -> dict | None:
    parser = _DOMAIN_PARSERS.get(urlparse(url).netloc.removeprefix("www."))
    if parser is None:
        return None
    return parser(BeautifulSoup(html, "html.parser"))


def _jsonld_recipe_steps(data: dict) -> list[str]:
    steps: list[str] = []
    for s in data.get("recipeInstructions", []):
        if isinstance(s, str) and s.strip():
            steps.append(s)
        elif isinstance(s, dict) and s.get("@type") == "HowToSection":
            # WP Recipe Maker's condensed "Abbreviated recipe" section
            # duplicates the real steps in one paragraph — skip it.
            if (s.get("name") or "").strip().lower().startswith("abbreviated"):
                continue
            # A HowToSection groups its own HowToStep items under
            # itemListElement instead of carrying step text directly.
            for sub in s.get("itemListElement", []):
                if isinstance(sub, dict) and sub.get("text", "").strip():
                    steps.append(sub["text"])
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
    if data.get("totalTime"):
        lines.append(f"Total time: {data['totalTime']}")
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
        # Theme-level classes can contain noise words (for example,
        # ``content-sidebar`` on RecipeTin Eats' body). Never remove structural
        # containers based on a generic class-name match.
        if el.name in {"html", "body", "main", "article"} or el.find(["article", "main"]):
            continue
        combined = " ".join(el.get("class") or []).lower() + " " + (el.get("id") or "").lower()
        if any(p in combined for p in _NOISE_ATTRS):
            el.decompose()

    # Prefer the page's semantic content before a generic recipe-named class:
    # sites often use the latter for navigation or breadcrumbs.
    container = (
        soup.find(class_="wprm-recipe-container")
        or soup.find("article")
        or soup.find("main")
        or soup.body
        or soup
    )

    return container.get_text(separator="\n", strip=True)[:4000]



async def _try_linked_url(
    url: str,
    model: str | None = None,
    available_tags: list[str] | None = None,
    usage: gemini_svc.UsageTracker | None = None,
) -> RecipeExtraction | None:
    try:
        html = await _fetch_html(url)
    except Exception as exc:
        log.warning("Failed to fetch linked URL %s: %s", url, exc)
        return None

    jsonld = _find_jsonld_recipe(html) or _find_microdata_recipe(html) or _find_domain_specific_recipe(url, html)
    if jsonld and _jsonld_recipe_is_complete(jsonld):
        source_text = _jsonld_recipe_to_text(jsonld)
    else:
        source_text = _strip_html(html)
        if len(source_text) < 50:
            return None

    result = await gemini_svc.extract_recipe(
        source_text, source_hint="webpage", model=model,
        available_tags=available_tags,
        usage=usage,
    )
    return result if _is_complete(result) else None


def _stage_event(key: str, label: str) -> dict[str, Any]:
    return {"type": "stage", "key": key, "label": label}


def _done_event(result: ImportResult, cache_key: str | None = None) -> dict[str, Any]:
    if cache_key and result.stage != ImportStage.FAILED:
        cache_svc.set(cache_key, result)
    return {"type": "done", "result": result.model_dump()}


def _ingredient_display(ing: Ingredient) -> str:
    parts = [p for p in [ing.qty, ing.unit, ing.name] if p]
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


async def run_import_stream(url: str, model: str | None = None, available_tags: list[str] | None = None, allergens: list[str] | None = None) -> AsyncGenerator[dict[str, Any], None]:
    cached = cache_svc.get(url)
    if cached is not None:
        log.debug("Cache hit for %s", url)
        yield _done_event(cached)
        return

    usage = gemini_svc.UsageTracker()

    if not _is_social_url(url):
        yield _stage_event("fetching_page", "Fetching recipe page…")
        try:
            html = await _fetch_html(url)
        except Exception as exc:
            log.warning("Could not fetch page %s: %s", url, exc)
            report_recipe_import_failure(
                input_kind="url", source_url=url, reason="could_not_fetch_page", error=exc,
            )
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

        jsonld = _find_jsonld_recipe(html) or _find_microdata_recipe(html) or _find_domain_specific_recipe(url, html)
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
                gemini_svc.extract_recipe(
                    source_text, source_hint="webpage", model=model,
                    available_tags=available_tags,
                    usage=usage,
                ),
                result_out,
            ):
                yield _ev
            result = result_out[0]
            if _is_complete(result):
                r = ImportResult(stage=stage, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens, usage), cache_key=url)
            else:
                report_recipe_import_failure(
                    input_kind="url", source_url=url, reason="no_complete_recipe_extracted",
                )
                yield _done_event(ImportResult(
                    stage=ImportStage.FAILED,
                    metadata=meta,
                    # The page was reachable, but its recipe is incomplete
                    # (for example, ingredients without instructions). Let
                    # the user finish the recipe manually from the source.
                    error=USER_ACTION_REQUIRED_ERROR_CODE,
                ))
        except Exception as exc:
            log.warning("Gemini extraction failed for %s: %s", url, exc)
            report_recipe_import_failure(
                input_kind="url", source_url=url, reason="gemini_extraction_error", error=exc,
            )
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
        report_recipe_import_failure(
            input_kind="url",
            source_url=url,
            reason="could_not_fetch_social_metadata",
            error=exc,
        )
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED,
            metadata=ImportMetadata(source_url=url),
            # Social posts can still be completed manually, even when the
            # scraper cannot retrieve their metadata.
            error=USER_ACTION_REQUIRED_ERROR_CODE,
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
                gemini_svc.extract_recipe(
                    metadata.description, source_hint="instagram/tiktok caption",
                    model=model, available_tags=available_tags,
                    usage=usage,
                ),
                result_out_desc,
            ):
                yield _ev
            result = result_out_desc[0]
            if _is_complete(result):
                r = ImportResult(stage=ImportStage.DESCRIPTION, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens, usage), cache_key=url)
                return
        except Exception as exc:
            log.warning("Gemini description stage failed: %s", exc)

    # Stage 2 — linked URLs
    for link in metadata.linked_urls[:3]:
        yield _stage_event("checking_links", "Checking linked page…")
        try:
            result = await _try_linked_url(
                link, model=model, available_tags=available_tags,
                usage=usage,
            )
            if result and _is_complete(result):
                r = ImportResult(stage=ImportStage.LINK, recipe=result, metadata=meta)
                yield _done_event(await _with_allergens(r, allergens, usage), cache_key=url)
                return
        except Exception as exc:
            log.warning("Link stage failed for %s: %s", link, exc)

    # Stage 3 — transcript
    requires_manual_action = False
    if metadata.video_url:
        yield _stage_event("fetching_transcript", "Transcribing video audio…")
        try:
            transcript = await transcribe_video(metadata.video_url, usage=usage)
            if transcript.strip():
                yield _stage_event("analyzing_transcript", "Analyzing transcript with Gemini…")
                result_out_tr: list = []
                async for _ev in _run_gemini(
                    gemini_svc.extract_recipe(
                        transcript, source_hint="video transcript", model=model,
                        available_tags=available_tags,
                        usage=usage,
                    ),
                    result_out_tr,
                ):
                    yield _ev
                result = result_out_tr[0]
                log.debug("Transcript extraction result: title=%r components=%d", result.title, len(result.components))
                if _is_complete(result):
                    r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
                    yield _done_event(await _with_allergens(r, allergens, usage), cache_key=url)
                    return
        except Exception as exc:
            log.warning("Transcription stage failed: %s", exc)
            requires_manual_action = (
                isinstance(exc, httpx.HTTPStatusError)
                and exc.response.status_code in (403, 404)
            )

    report_recipe_import_failure(
        input_kind="url",
        source_url=url,
        reason="video_source_unavailable" if requires_manual_action else "no_complete_recipe_extracted",
    )
    yield _done_event(ImportResult(
        stage=ImportStage.FAILED,
        metadata=meta,
        # The available social content did not contain a complete recipe. This
        # includes image posts and captions with ingredients but no steps, so
        # direct the user to finish the recipe manually.
        error=USER_ACTION_REQUIRED_ERROR_CODE,
    ))


async def run_text_import_stream(
    text: str,
    model: str | None = None,
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    yield _stage_event("analyzing_text", "Analyzing recipe text with Gemini…")
    meta = ImportMetadata()
    usage = gemini_svc.UsageTracker()
    try:
        result_out_txt: list = []
        async for _ev in _run_gemini(
            gemini_svc.extract_recipe(
                text[:6000], source_hint="pasted text", model=model,
                available_tags=available_tags,
                usage=usage,
            ),
            result_out_txt,
        ):
            yield _ev
        result = result_out_txt[0]
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens, usage))
        else:
            report_recipe_import_failure(
                input_kind="text", input_size=len(text), reason="no_complete_recipe_extracted",
            )
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED, metadata=meta,
                error="Could not extract a recipe from this text.",
            ))
    except Exception as exc:
        report_recipe_import_failure(
            input_kind="text", input_size=len(text), reason="gemini_extraction_error", error=exc,
        )
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED, metadata=meta,
            error=f"Gemini extraction failed: {exc}",
        ))


async def run_image_import_stream(
    image_data: bytes,
    mime_type: str,
    model: str | None = None,
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    yield _stage_event("analyzing_image", "Analyzing image with Gemini Vision…")
    meta = ImportMetadata()
    usage = gemini_svc.UsageTracker()
    try:
        result_out_img: list = []
        async for _ev in _run_gemini(
            gemini_svc.extract_recipe_from_image(
                image_data, mime_type=mime_type, model=model,
                available_tags=available_tags,
                usage=usage,
            ),
            result_out_img,
        ):
            yield _ev
        result = result_out_img[0]
        if _is_complete(result):
            r = ImportResult(stage=ImportStage.TRANSCRIPT, recipe=result, metadata=meta)
            yield _done_event(await _with_allergens(r, allergens, usage))
        else:
            report_recipe_import_failure(
                input_kind="image", input_size=len(image_data), reason="no_complete_recipe_extracted",
            )
            yield _done_event(ImportResult(
                stage=ImportStage.FAILED, metadata=meta,
                error="Could not extract a recipe from this image.",
            ))
    except Exception as exc:
        report_recipe_import_failure(
            input_kind="image", input_size=len(image_data), reason="gemini_extraction_error", error=exc,
        )
        yield _done_event(ImportResult(
            stage=ImportStage.FAILED, metadata=meta,
            error=f"Gemini image extraction failed: {exc}",
        ))
