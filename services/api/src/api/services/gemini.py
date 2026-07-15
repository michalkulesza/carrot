from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from api.config import settings
from api.models import (
    Ingredient,
    RecipeComponent,
    RecipeEnrichment,
    RecipeExtraction,
    RecipeSourceExtraction,
    RecipeUnitVariants,
)

log = logging.getLogger(__name__)

_DEFAULT_MECHANICAL_MODEL = "gemini-2.5-flash-lite"
_MAX_ENRICHMENT_ATTEMPTS = 3

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

_EXTRACTION_SYSTEM = """\
You faithfully extract recipes from social-media captions, webpages, video transcripts,
or images. Preserve the original language.

CRITICAL: Only extract ingredients, quantities, and steps explicitly present in the source.
Never add ingredients, change stated numbers, estimate values, convert units, round values,
infer missing steps, calculate nutrition, assign tags, detect allergens, or add references.

Return JSON matching the provided schema. If there is no recipe, return null title and an
empty components array. Create a component for each explicit section. Extract servings only
when stated; otherwise return null. For a stated servings range, use its midpoint rounded to
a whole number. Separate qty, unit, and name only when doing so preserves the source exactly.
Use only these units: """ + _ALLOWED_UNITS + """. For unsupported units, preserve the entire
ingredient text in name with null qty and unit. Leave enrichment fields empty.
"""

_UNIT_CONVERSION_SYSTEM = """\
Convert recipe units into metric and imperial variants. Return the same number of
components as the input, in the same order. For every component, return BOTH unit
variants in parallel arrays:
- metric_ingredients and metric_steps: use grams/kilograms/millilitres/litres and
  Celsius. Convert every cup measurement to an ingredient-specific whole gram
  value; never use a range.
- imperial_ingredients and imperial_steps: use cups/tbsp/tsp where practical and
  Fahrenheit.
Each variant array must have the same number of entries and order as the
component's source ingredients or steps. Preserve ingredient names and cooking
instructions; change only units, amounts, and temperatures in the variant
fields. Never modify ingredients or steps.
"""

_ENRICHMENT_SYSTEM = """\
You enrich an already-faithful recipe extraction with derived data. The input's
title, servings, components, ingredient quantities, units, names, and steps are
authoritative: never add, remove, reorder, or alter them, and never return them —
only return the fields below, one entry per source component, in the same order.

""" + _UNIT_CONVERSION_SYSTEM + """

For every ingredient, also return a shopping_list_value: the concise text that
should be added to a shopping list. Preserve the ingredient and its needed
amount, but round UP indivisible items to a practical whole purchase quantity
(e.g. "0.5 onion" → "1 onion", "1.5 avocados" → "2 avocados"). Do not round
weights, volumes, or other divisible measurements (e.g. "125 g butter" stays
"125 g butter"). Include preparation notes only when they are important for
what to buy. If no quantity is given, return the ingredient name.
shopping_list_values must have exactly one entry per source ingredient, in order.

total_time_minutes: total elapsed time from starting preparation to serving, in
whole minutes. Include prep, active cooking, passive cooking, and resting time.
Extract it when stated; otherwise estimate a realistic total from the recipe's
steps. If no recipe content is present at all, return null.

kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving: these
are REQUIRED — always provide a number, never omit them. Extract from the text
if stated. If not stated, estimate based on the ingredients and typical
preparation; provide a realistic round number (kcal as whole kcal, the rest in
grams). If no recipe content is present at all, use 0.

tags: if a list of available tags is provided, assign only those that clearly apply
to this recipe. Use only tags from the provided list — never invent new ones.

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


async def _enrich_recipe(
    source: RecipeSourceExtraction,
    available_tags: list[str] | None,
    generous: bool,
    usage: UsageTracker | None,
) -> RecipeEnrichment:
    prompt = {"source_recipe": source.model_dump(mode="json")}
    if available_tags:
        prompt["available_tags"] = available_tags

    client = _build_client()
    validation_error: str | None = None
    for attempt in range(1, _MAX_ENRICHMENT_ATTEMPTS + 1):
        attempt_prompt = prompt.copy()
        if validation_error:
            attempt_prompt["previous_validation_error"] = (
                f"Your previous response was invalid: {validation_error}. "
                "Regenerate every enrichment field from source_recipe, preserving its exact "
                "component, ingredient, and step counts."
            )

        response = await _with_retry(
            lambda: client.models.generate_content(
                model=_DEFAULT_MECHANICAL_MODEL,
                contents=json.dumps(attempt_prompt, ensure_ascii=False),
                config=types.GenerateContentConfig(
                    system_instruction=_ENRICHMENT_SYSTEM,
                    temperature=0,
                    response_mime_type="application/json",
                    response_schema=RecipeEnrichment,
                ),
            ),
            generous=generous,
        )
        if usage is not None:
            usage.add(response)

        try:
            enrichment = RecipeEnrichment.model_validate(json.loads(response.text))
            # Validate every parallel output before accepting the enrichment. The
            # source extraction remains fixed across retries.
            assemble_recipe(source, enrichment)
            return enrichment
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            validation_error = str(exc)
            if attempt == _MAX_ENRICHMENT_ATTEMPTS:
                raise
            log.warning(
                "Gemini enrichment response failed validation (attempt %d/%d): %s",
                attempt,
                _MAX_ENRICHMENT_ATTEMPTS,
                validation_error,
            )

    raise AssertionError("unreachable")


def assemble_recipe(source: RecipeSourceExtraction, enrichment: RecipeEnrichment) -> RecipeExtraction:
    """Combines a faithful source extraction with its enrichment, validating alignment.

    Canonical fields (title, servings, component metadata, ingredient qty/unit/name,
    steps) always come from `source`, never from `enrichment` — this is what prevents
    the enrichment call from silently overwriting the faithful extraction.
    """
    if len(enrichment.components) != len(source.components):
        raise ValueError(
            f"Enrichment returned {len(enrichment.components)} components, "
            f"expected {len(source.components)}"
        )

    components: list[RecipeComponent] = []
    for index, (source_component, enriched) in enumerate(zip(source.components, enrichment.components)):
        ingredient_count = len(source_component.ingredients)
        step_count = len(source_component.steps)

        for field_name, values in (
            ("metric_ingredients", enriched.metric_ingredients),
            ("imperial_ingredients", enriched.imperial_ingredients),
            ("shopping_list_values", enriched.shopping_list_values),
        ):
            if len(values) != ingredient_count:
                raise ValueError(
                    f"Component {index}: {field_name} has {len(values)} entries, "
                    f"expected {ingredient_count}"
                )
        for field_name, values in (
            ("metric_steps", enriched.metric_steps),
            ("imperial_steps", enriched.imperial_steps),
        ):
            if len(values) != step_count:
                raise ValueError(
                    f"Component {index}: {field_name} has {len(values)} entries, "
                    f"expected {step_count}"
                )
        for ref in enriched.step_refs:
            if not (0 <= ref.step_index < step_count) or not (0 <= ref.ingredient_index < ingredient_count):
                raise ValueError(f"Component {index}: step_ref {ref} is out of range")

        ingredients = [
            Ingredient(qty=ing.qty, unit=ing.unit, name=ing.name, shopping_list_value=shopping_value)
            for ing, shopping_value in zip(source_component.ingredients, enriched.shopping_list_values)
        ]
        components.append(RecipeComponent(
            role=source_component.role,
            name=source_component.name,
            yield_note=source_component.yield_note,
            ingredients=ingredients,
            steps=source_component.steps,
            metric_ingredients=enriched.metric_ingredients,
            imperial_ingredients=enriched.imperial_ingredients,
            metric_steps=enriched.metric_steps,
            imperial_steps=enriched.imperial_steps,
            step_refs=enriched.step_refs,
        ))

    return RecipeExtraction(
        title=source.title,
        servings=source.servings,
        total_time_minutes=enrichment.total_time_minutes,
        kcal_per_serving=enrichment.kcal_per_serving,
        protein_per_serving=enrichment.protein_per_serving,
        fat_per_serving=enrichment.fat_per_serving,
        carbs_per_serving=enrichment.carbs_per_serving,
        tags=enrichment.tags,
        components=components,
    )


async def extract_recipe(
    text: str,
    source_hint: str = "",
    model: str | None = None,
    available_tags: list[str] | None = None,
    generous: bool = False,
    usage: UsageTracker | None = None,
) -> RecipeExtraction:
    extraction_model = model or settings.gemini_extraction_model
    parts = []
    if source_hint:
        parts.append(f"Source: {source_hint}")
    parts.append(text)
    prompt = "\n\n".join(parts)

    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=extraction_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_EXTRACTION_SYSTEM,
                temperature=0,
                response_mime_type="application/json",
                response_schema=RecipeSourceExtraction,
            ),
        ),
        generous=generous,
    )
    if usage is not None:
        usage.add(response)

    raw = response.text
    log.debug("Gemini raw response (%s): %s", source_hint, raw[:500])
    source = RecipeSourceExtraction.model_validate(json.loads(raw))
    enrichment = await _enrich_recipe(source, available_tags, generous, usage)
    return assemble_recipe(source, enrichment)


async def extract_recipe_from_image(
    image_data: bytes,
    mime_type: str = "image/jpeg",
    model: str | None = None,
    available_tags: list[str] | None = None,
    generous: bool = False,
    usage: UsageTracker | None = None,
) -> RecipeExtraction:
    extraction_model = model or settings.gemini_extraction_model
    parts_text = []
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
            model=extraction_model,
            contents=[
                types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_data)),
                text_prompt,
            ],
            config=types.GenerateContentConfig(
                system_instruction=_EXTRACTION_SYSTEM,
                temperature=0,
                response_mime_type="application/json",
                response_schema=RecipeSourceExtraction,
            ),
        ),
        generous=generous,
    )
    if usage is not None:
        usage.add(response)

    raw = response.text
    log.debug("Gemini image extraction raw: %s", raw[:500])
    source = RecipeSourceExtraction.model_validate(json.loads(raw))
    enrichment = await _enrich_recipe(source, available_tags, generous, usage)
    return assemble_recipe(source, enrichment)


async def estimate_unit_variants(
    components: list[dict],
    model: str = _DEFAULT_MECHANICAL_MODEL,
    usage: UsageTracker | None = None,
) -> RecipeUnitVariants:
    prompt = json.dumps({"components": components}, ensure_ascii=False)
    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_UNIT_CONVERSION_SYSTEM,
                temperature=0,
                response_mime_type="application/json",
                response_schema=RecipeUnitVariants,
            ),
        )
    )
    if usage is not None:
        usage.add(response)
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
    model: str = _DEFAULT_MECHANICAL_MODEL,
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
    model: str = _DEFAULT_MECHANICAL_MODEL,
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
