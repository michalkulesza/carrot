from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable
from typing import Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from api.config import settings
from api.models import RecipeExtraction

log = logging.getLogger(__name__)

_DEFAULT_MODEL = "gemini-2.5-flash"

_T = TypeVar("_T")


def _retry_delays(generous: bool = False):
    if generous:
        for d in (1, 2, 4, 8, 16, 30, 60):
            yield d
        while True:
            yield 60
    else:
        for d in (1, 2, 4):
            yield d
        while True:
            yield 8


async def _with_retry(
    fn: Callable[[], _T],
    on_high_demand: Callable[[], Awaitable[None]] | None = None,
    generous: bool = False,
    max_attempts: int = 200,
) -> _T:
    high_demand_notified = False
    for attempt, delay in enumerate(_retry_delays(generous=generous), start=1):
        if attempt > max_attempts:
            raise RuntimeError(f"Gemini: exceeded {max_attempts} retry attempts")
        try:
            return fn()
        except Exception as exc:
            msg = str(exc)
            is_transient = "503" in msg or "UNAVAILABLE" in msg or "429" in msg or "RESOURCE_EXHAUSTED" in msg
            if not is_transient:
                raise
            if on_high_demand is not None and not high_demand_notified:
                high_demand_notified = True
                await on_high_demand()
            log.warning("Gemini transient error (attempt %d), retrying in %ds: %s", attempt, delay, msg[:120])
            await asyncio.sleep(delay)

_ALLOWED_UNITS = (
    "volume: ml, l, tsp, tbsp, cup | "
    "weight: g, kg | "
    "count: piece, clove, slice, can, bunch, pinch, sprig, handful"
)

_SYSTEM = """\
You are a recipe extraction assistant. Given text from a social media caption,
a webpage, or a video transcript, extract all recipe information you can find.
The text may be in any language — extract faithfully in the original language.

Return JSON matching the provided schema. If no recipe content is present, return
an object with null title and empty components array.

For ingredients, always try to separate qty/unit/name/note. Use ONLY these units:
  """ + _ALLOWED_UNITS + """
  Convert any other unit to the closest allowed unit (e.g. oz → g, fl oz → ml).
  Convert temperatures in step text from °F to °C. Keep cups/tbsp as-is.
  If no unit applies, set unit to null.

Examples:
  "2 cups flour" → qty="2", unit="cup", name="flour"
  "3 cloves garlic, minced" → qty="3", unit="clove", name="garlic", note="minced"
  "salt to taste" → qty=null, unit=null, name="salt", note="to taste"
  "1 oz butter" → qty="28", unit="g", name="butter"

For multi-component recipes (e.g. "for the sauce:", "for the marinade:"),
create a separate component for each section.

servings: extract from the text if stated. If not stated, estimate a reasonable
serving count based on the ingredient quantities and dish type.

kcal_per_serving: extract from the text if stated. If not stated, estimate based
on the ingredients and typical preparation. Provide a realistic round number.

tags: if a list of available tags is provided, assign only those that clearly apply
to this recipe. Use only tags from the provided list — never invent new ones.

allergens: if a list of allergens is provided, check each ingredient against it.
For each ingredient set:
- "allergen": the exact allergen name from the list if the ingredient contains it, else null
- "substitute": a single best substitute ingredient name if allergen found, else null
Only flag allergens from the provided list — never flag others.

step_refs: for every ingredient mentioned in a step — whether by full name,
inflected/declined form (e.g. "kurczaki" or "kurczakiem" for ingredient
"kurczak", "Zwiebeln" for "Zwiebel"), key noun ("chicken" for "chicken thighs,
skin on"), plural, abbreviation, or any morphological variant — add one entry:
  step_index: 0-based index of the step in this component's steps list
  ingredient_index: 0-based index of the ingredient in this component's ingredients list
  mention: the exact substring as it appears in the step text
Match across all languages. For inflected languages (Polish, Russian, Czech,
German, etc.) recognise all grammatical case and number variants of the
ingredient name. Leave step_refs empty only if no ingredient is referenced.
"""

_ALLERGEN_SYSTEM = """\
You are an allergen detection assistant. Given a numbered list of ingredients and
a list of allergens to check, identify which ingredients contain each allergen
and suggest a substitute.

For each ingredient return (in the same order):
- allergen: the exact allergen name from the provided list if found, else null
- substitute: the full replacement ingredient text. Replace the allergen
  ingredient name with the best allergen-free substitute and adjust ALL
  measurements (volume, weight, count) to the correct amount for that
  substitute to achieve the same culinary result — do not blindly copy
  numbers from the original. Keep all other modifiers and notes.
  For example: "⅓ cup (95g) smooth peanut butter" → "¼ cup (60g) tahini"
  if tahini is stronger and less is needed.
  If no allergen found, return null.

Return exactly as many entries as there are input ingredients, in the same order.
"""


def _build_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


async def extract_recipe(
    text: str,
    source_hint: str = "",
    model: str = _DEFAULT_MODEL,
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
    on_high_demand: Callable[[], Awaitable[None]] | None = None,
    generous: bool = False,
) -> RecipeExtraction:
    parts = []
    if source_hint:
        parts.append(f"Source: {source_hint}")
    if available_tags:
        parts.append(f"Available tags: {', '.join(available_tags)}")
    if allergens:
        parts.append(f"Allergens to check: {', '.join(allergens)}")
    parts.append(text)
    prompt = "\n\n".join(parts)

    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM,
                response_mime_type="application/json",
                response_schema=RecipeExtraction,
            ),
        ),
        on_high_demand=on_high_demand,
        generous=generous,
    )

    raw = response.text
    log.debug("Gemini raw response (%s): %s", source_hint, raw[:500])
    data = json.loads(raw)
    return RecipeExtraction.model_validate(data)


async def extract_recipe_from_image(
    image_data: bytes,
    mime_type: str = "image/jpeg",
    model: str = _DEFAULT_MODEL,
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
    on_high_demand: Callable[[], Awaitable[None]] | None = None,
    generous: bool = False,
) -> RecipeExtraction:
    parts_text = []
    if available_tags:
        parts_text.append(f"Available tags: {', '.join(available_tags)}")
    if allergens:
        parts_text.append(f"Allergens to check: {', '.join(allergens)}")
    parts_text.append(
        "Extract the recipe from this image. "
        "This may be a photo of a cookbook page, recipe card, handwritten recipe, or screenshot. "
        "If the image does not contain a recipe (e.g. it's an unrelated photo, a meme, or text "
        "with no ingredients or steps), return null title and an empty components array — do not "
        "invent a recipe."
    )
    text_prompt = "\n\n".join(parts_text)

    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=[
                types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_data)),
                text_prompt,
            ],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM,
                response_mime_type="application/json",
                response_schema=RecipeExtraction,
            ),
        ),
        on_high_demand=on_high_demand,
        generous=generous,
    )

    raw = response.text
    log.debug("Gemini image extraction raw: %s", raw[:500])
    data = json.loads(raw)
    return RecipeExtraction.model_validate(data)


class _IngredientFlag(BaseModel):
    allergen: str | None = None
    substitute: str | None = None


class _AllergenAnalysisResult(BaseModel):
    results: list[_IngredientFlag]


async def analyze_allergens(
    ingredients: list[str],
    allergens: list[str],
    model: str = _DEFAULT_MODEL,
) -> list[_IngredientFlag]:
    if not ingredients or not allergens:
        return [_IngredientFlag() for _ in ingredients]

    numbered = "\n".join(f"{i + 1}. {ing}" for i, ing in enumerate(ingredients))
    prompt = f"Allergens to check: {', '.join(allergens)}\n\nIngredients:\n{numbered}"

    client = _build_client()
    response = await _with_retry(lambda: client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=_ALLERGEN_SYSTEM,
            response_mime_type="application/json",
            response_schema=_AllergenAnalysisResult,
        ),
    ))

    raw = response.text
    log.debug("Gemini allergen analysis raw: %s", raw[:500])
    data = json.loads(raw)
    result = _AllergenAnalysisResult.model_validate(data)

    # Ensure same length as input (pad or truncate)
    flags = result.results
    while len(flags) < len(ingredients):
        flags.append(_IngredientFlag())
    return flags[:len(ingredients)]


