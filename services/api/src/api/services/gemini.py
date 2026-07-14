from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from api.config import settings
from api.models import RecipeExtraction, RecipeUnitVariants

log = logging.getLogger(__name__)

_DEFAULT_MODEL = "gemini-2.5-flash"

_T = TypeVar("_T")


class UsageTracker:
    """Accumulates token usage across every Gemini call made during one import."""

    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.calls = 0

    def add(self, response: object) -> None:
        meta = getattr(response, "usage_metadata", None)
        if meta is None:
            return
        self.input_tokens += meta.prompt_token_count or 0
        self.output_tokens += meta.candidates_token_count or 0
        self.calls += 1


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
    generous: bool = False,
    max_attempts: int = 200,
) -> _T:
    if settings.debug_artificial_delay_seconds > 0:
        await asyncio.sleep(settings.debug_artificial_delay_seconds)
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
            log.warning("Gemini transient error (attempt %d), retrying in %ds: %s", attempt, delay, msg[:120])
            await asyncio.sleep(delay)

_ALLOWED_UNITS = (
    "volume: ml, l, tsp, tbsp, cup | "
    "weight: g, kg | "
    "count: clove, slice, can, bunch, pinch, sprig, handful"
)

_SYSTEM = """\
You are a recipe extraction assistant. Given text from a social media caption,
a webpage, or a video transcript, extract all recipe information you can find.
The text may be in any language — extract faithfully in the original language.

Return JSON matching the provided schema. If no recipe content is present, return
an object with null title, empty components array, and 0 for every nutrition field.

For ingredients, always try to separate qty/unit/name. Use ONLY these units:
  """ + _ALLOWED_UNITS + """
  Convert any other unit to the closest allowed unit (e.g. oz → g, fl oz → ml).
  If no unit applies, set unit to null.

Examples:
  "2 cups flour" → qty="2", unit="cup", name="flour"
  "3 cloves garlic, minced" → qty="3", unit="clove", name="garlic, minced"
  "salt to taste" → qty=null, unit=null, name="salt, to taste"
  "1 oz butter" → qty="28", unit="g", name="butter"

For every ingredient, also return shopping_list_value: the concise text that
should be added to a shopping list. Preserve the ingredient and its needed
amount, but round UP indivisible items to a practical whole purchase quantity
(e.g. "0.5 onion" → "1 onion", "1.5 avocados" → "2 avocados"). Do not round
weights, volumes, or other divisible measurements (e.g. "125 g butter" stays
"125 g butter"). Include preparation notes only when they are important for
what to buy. If no quantity is given, return the ingredient name.

For every component, return BOTH unit variants in parallel arrays:
- metric_ingredients and metric_steps: use grams/kilograms/millilitres/litres
  and Celsius. Convert every cup measurement to an ingredient-specific whole
  gram value; never use a range.
- imperial_ingredients and imperial_steps: use cups/tbsp/tsp where practical
  and Fahrenheit.
Each variant array must have the same number of entries and order as ingredients
or steps. Preserve ingredient names and cooking instructions; change only units,
amounts, and temperatures. The ingredients and steps fields should contain the
metric variant as structured ingredients and steps respectively.

For multi-component recipes (e.g. "for the sauce:", "for the marinade:"),
create a separate component for each section.

servings: extract from the text if stated, as a single integer. If a range is
given (e.g. "4 to 6 servings", "4-6 servings"), use the midpoint rounded to the
nearest whole number (e.g. "4 to 6" → 5) — never concatenate the range into one
number (e.g. "4 to 6" is NOT 46). If not stated, estimate a reasonable serving
count based on the ingredient quantities and dish type.

kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving: these
are REQUIRED — always provide a number, never omit them. Extract from the text
if stated. If not stated, estimate based on the ingredients and typical
preparation; provide a realistic round number (kcal as whole kcal, the rest in
grams). If no recipe content is present at all, use 0.

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
    generous: bool = False,
    usage: UsageTracker | None = None,
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
        generous=generous,
    )
    if usage is not None:
        usage.add(response)

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
    generous: bool = False,
    usage: UsageTracker | None = None,
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
        generous=generous,
    )
    if usage is not None:
        usage.add(response)

    raw = response.text
    log.debug("Gemini image extraction raw: %s", raw[:500])
    data = json.loads(raw)
    return RecipeExtraction.model_validate(data)


async def estimate_unit_variants(components: list[dict], model: str = _DEFAULT_MODEL) -> RecipeUnitVariants:
    prompt = json.dumps({"components": components}, ensure_ascii=False)
    instruction = """\
You convert recipe units. Return the same number of components, in the same order.
For each component, return metric_ingredients, imperial_ingredients, metric_steps,
and imperial_steps. Keep every array aligned with its source array. Metric values use
grams/kilograms/millilitres/litres and Celsius; convert cups to ingredient-specific
whole gram values, never ranges. Imperial values use cups/tbsp/tsp where practical
and Fahrenheit. Preserve ingredient names and instruction wording except units,
amounts, and temperatures. Also return ingredients and steps as metric equivalents.
"""
    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=instruction,
                response_mime_type="application/json",
                response_schema=RecipeUnitVariants,
            ),
        )
    )
    return RecipeUnitVariants.model_validate(json.loads(response.text))


class _IngredientFlag(BaseModel):
    allergen: str | None = None
    substitute: str | None = None


class _AllergenAnalysisResult(BaseModel):
    results: list[_IngredientFlag]


class _ShoppingListValuesResult(BaseModel):
    values: list[str]


async def recommend_shopping_list_values(
    ingredients: list[str],
    model: str = _DEFAULT_MODEL,
) -> list[str]:
    """Return a practical shopping-list value for every ingredient, in order."""
    if not ingredients:
        return []

    numbered = "\n".join(f"{i + 1}. {ingredient}" for i, ingredient in enumerate(ingredients))
    instruction = """\
You prepare recipe ingredients for a shopping list. Return one concise value for
each input ingredient in exactly the same order and language. Preserve the
ingredient and needed amount. Round UP indivisible food items to a practical
whole purchase quantity (for example, \"0.5 sweet onion\" becomes \"1 sweet
onion\" and \"1.5 avocados\" becomes \"2 avocados\"). Do not round weights,
volumes, or other divisible measurements (for example, \"125 g butter\" stays
\"125 g butter\"). Keep preparation notes only when important for buying.
"""
    client = _build_client()
    response = await _with_retry(lambda: client.models.generate_content(
        model=model,
        contents=numbered,
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=_ShoppingListValuesResult,
        ),
    ))
    result = _ShoppingListValuesResult.model_validate(json.loads(response.text))
    if len(result.values) != len(ingredients):
        raise RuntimeError("Gemini returned the wrong number of shopping-list values")
    return result.values


async def analyze_allergens(
    ingredients: list[str],
    allergens: list[str],
    model: str = _DEFAULT_MODEL,
    usage: UsageTracker | None = None,
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
    if usage is not None:
        usage.add(response)

    raw = response.text
    log.debug("Gemini allergen analysis raw: %s", raw[:500])
    data = json.loads(raw)
    result = _AllergenAnalysisResult.model_validate(data)

    # Ensure same length as input (pad or truncate)
    flags = result.results
    while len(flags) < len(ingredients):
        flags.append(_IngredientFlag())
    return flags[:len(ingredients)]
