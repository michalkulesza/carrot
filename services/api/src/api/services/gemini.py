from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from api.config import settings
from api.models import (
    EnrichmentComponent,
    Ingredient,
    RecipeComponent,
    RecipeEnrichment,
    RecipeExtraction,
    RecipeSourceExtraction,
    ShoppingCategory,
    SourceComponent,
    SourceIngredient,
    UnitEnum,
)
from api.services.extraction_v2.contracts import FailureReason
from api.services.ingredient_parser_v2 import parse_ingredient
from api.services.unit_variants import build_variants

log = logging.getLogger(__name__)

_DEFAULT_MECHANICAL_MODEL = "gemini-3.1-flash-lite"
_STEP_INGREDIENT_MATCH_MODEL = "gemini-3.1-flash-lite"
_MAX_ENRICHMENT_ATTEMPTS = 3


def _v2_parsed_ingredient(parsed, source_text: str, category) -> Ingredient:
    """Map a deterministic parse into the current ingredient schema safely."""
    try:
        unit = UnitEnum(parsed.unit) if parsed.unit else None
    except ValueError:
        # Keep unfamiliar units visible until the application schema supports them.
        qty, unit, name = None, None, source_text
    else:
        qty = parsed.qty
        name = parsed.name or source_text
    return Ingredient(
        qty=qty,
        unit=unit,
        name=name,
        shopping_list_value=source_text,
        shopping_list_category=category,
    )


def _v2_source_ingredient(parsed, source_text: str) -> SourceIngredient:
    ingredient = _v2_parsed_ingredient(parsed, source_text, None)
    return SourceIngredient(qty=ingredient.qty, unit=ingredient.unit, name=ingredient.name)

class AudioRecipeEvidenceComponent(BaseModel):
    name: str | None = None
    ingredients: list[str] = []
    steps: list[str] = []


class AudioRecipeEvidence(BaseModel):
    title: str | None = None
    components: list[AudioRecipeEvidenceComponent] = []
    failure_reason: FailureReason | None = None


_AUDIO_EVIDENCE_SYSTEM = """\
Extract only recipe facts explicitly spoken in the supplied transcript. Preserve
the transcript's original wording and language. Do not infer, repair, convert,
or add quantities, ingredients, times, temperatures, or instructions. Return
ingredients and steps in their spoken order. Retained evidence is authoritative.
If it contains any ingredient, return no ingredients at all; if it contains any
step, return no steps at all. Supply only the category that is entirely absent
from retained evidence. When supplying steps, include only cooking actions; never
relabel an ingredient list, seasoning declaration, product claim, or ingredient
description as a step. Never replace or restate retained facts. If the transcript
contains no usable recipe facts, return empty components and one of only
NO_RECIPE_CONTENT, AMBIGUOUS_RECIPE, or UNREADABLE_CONTENT as failure_reason.
A product/appliance review, advertisement, testimonial, or lifestyle discussion
is not a recipe merely because it mentions ingredients or gives an incidental
serving suggestion. Otherwise leave failure_reason null.
"""


_SHOPPING_CATEGORY_MEANINGS = {
    "produce": "fresh fruit, vegetables, herbs, and salad greens",
    "pantry": "shelf-stable food, dry goods, canned goods, and condiments",
    "dairy_eggs": "milk, cheese, yogurt, butter, and eggs",
    "meat_seafood": "meat, poultry, fish, and seafood",
    "frozen": "frozen food",
    "other": "anything not covered by the other categories",
}
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

_TRANSCRIPTION_SYSTEM = """\
You are a precise audio transcription system. Transcribe only the spoken audio
you can hear. Detect the language automatically; it may be Polish, Spanish,
German, French, English, or a mixture. Return the transcript in the original
spoken language and never translate, summarize, explain, or format it as a
recipe.

Create a complete, near-verbatim transcript of the recipe instructions. Preserve
every distinct spoken action in the order it is said, even when it seems
repetitive, brief, or obvious. Do not merge multiple cooking actions into a
single sentence or omit an instruction because ingredients or a result are
already known. Preserve every spoken ingredient, amount, unit, temperature,
duration, technique, and correction exactly, including code-switching. You may
remove greetings and verbal filler only when they do not contain a recipe
instruction. Use natural sentences and paragraph breaks, but do not add headings,
numbered steps, bullets, or other structure that was not spoken. If a word or
phrase cannot be understood, write [inaudible] rather than guessing. Do not use
the video title, caption, visual content, or general cooking knowledge to fill
in anything that is not audible.
"""

_STEP_INGREDIENT_MATCH_INSTRUCTION = """\
Match recipe steps to the ingredients they reference. Return exactly one match
object for every provided step, identified by its authoritative component_index
and step_index. For each reference, copy the authoritative ingredient_index and
quote the shortest exact phrase from the step that identifies it as evidence.

Recognise full names, key nouns, plurals, abbreviations, and grammatical case or
number variants in every language. Include every referenced ingredient, not just
one. Use an empty references list when a step references no ingredient. Never
invent an index or evidence phrase. Do not calculate a middle index; the server
does that after validating your references.
"""

_ENRICHMENT_SYSTEM = """\
You enrich an already-faithful recipe extraction with derived data. The input's
title, servings, components, ingredient quantities, units, names, and steps are
authoritative: never add, remove, reorder, or alter them, and never return them —
only return the fields below, one entry per source component, in the same order.

For every ingredient, also return a shopping_list_value: the concise text that
should be added to a shopping list. Preserve the ingredient and its needed
amount, but round UP indivisible items to a practical whole purchase quantity
(e.g. "0.5 onion" → "1 onion", "1.5 avocados" → "2 avocados"). Do not round
weights, volumes, or other divisible measurements (e.g. "125 g butter" stays
"125 g butter"). Include preparation notes only when they are important for
what to buy. If no quantity is given, return the ingredient name.
shopping_list_values must have exactly one entry per source ingredient, in order.

shopping_list_categories must have exactly one entry per source ingredient, in
the same order as shopping_list_values. Use exactly one stable ID, never a
localized display label or an invented ID:
""" + "\n".join(
    f"- {category}: {meaning}"
    for category, meaning in _SHOPPING_CATEGORY_MEANINGS.items()
) + """

total_time_minutes: practical kitchen time in whole minutes. Include preparation
and cooking or baking time, but exclude unattended resting, proofing, chilling,
marinating, and other long passive waits. Extract it when stated; otherwise
estimate a realistic total from the recipe's steps. If no recipe content is
present at all, return null.

kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving: these
are REQUIRED — always provide a number, never omit them. Extract from the text
if stated. If not stated, estimate based on the ingredients and typical
preparation; provide a realistic round number (kcal as whole kcal, the rest in
grams). If no recipe content is present at all, use 0.

tags: if a list of available tags is provided, assign only those that clearly apply
to this recipe. Use only tags from the provided list — never invent new ones.
"""

_ALLERGEN_SYSTEM = """\
You are an allergen detection assistant. Given a numbered list of ingredients and
a list of allergens to check, identify which ingredients contain each allergen
and suggest a substitute.

Only report an allergen when the ingredient text itself provides reliable
evidence that the allergen is present. Do not infer an allergen from a product
that has brand- or recipe-dependent formulations. In particular, generic
sauces, condiments, seasoning mixes, stocks, broths, pastes, dressings, and
marinades are not proof of gluten or another allergen unless the ingredient text
explicitly names an allergen-bearing component. "Chili garlic sauce" alone is
not evidence of gluten; "chili garlic sauce containing wheat" is.

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


async def extract_audio_recipe_evidence(
    transcript: str,
    retained_recipe: dict[str, Any],
    model: str | None = None,
    usage: UsageTracker | None = None,
    timeout_seconds: float = 45,
) -> AudioRecipeEvidence:
    """Run source-only transcript extraction before enrichment in the v2 flow."""

    if timeout_seconds <= 0:
        raise ValueError("audio evidence timeout must be positive")
    client = _build_client()
    request_timeout_ms = max(1, int(min(timeout_seconds, 20) * 1000))
    async with client.aio as aio, asyncio.timeout(timeout_seconds):
        for attempt in range(2):
            try:
                response = await aio.models.generate_content(
                    model=model or settings.gemini_extraction_model,
                    contents=json.dumps({"transcript": transcript, "retained_recipe": retained_recipe}),
                    config=types.GenerateContentConfig(
                        system_instruction=_AUDIO_EVIDENCE_SYSTEM,
                        temperature=0,
                        response_mime_type="application/json",
                        response_schema=AudioRecipeEvidence,
                        http_options=types.HttpOptions(
                            timeout=request_timeout_ms,
                            retry_options=types.HttpRetryOptions(attempts=1),
                        ),
                    ),
                )
                break
            except Exception as error:
                transient = getattr(error, "code", None) in {429, 500, 503, 504} or any(
                    code in str(error) for code in ("429", "500", "503", "504", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED")
                )
                if not transient or attempt:
                    raise
                await asyncio.sleep(1)
    if usage is not None:
        usage.add(response)
    return AudioRecipeEvidence.model_validate(json.loads(response.text or "{}"))


async def transcribe_audio(
    audio_data: bytes,
    model: str = _DEFAULT_MECHANICAL_MODEL,
    usage: UsageTracker | None = None,
) -> str:
    client = _build_client()
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(data=audio_data, mime_type="audio/mpeg"),
                "Transcribe the spoken audio in this file.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=_TRANSCRIPTION_SYSTEM,
                temperature=0,
            ),
        ),
    )
    if usage is not None:
        usage.add(response)
    transcript = (response.text or "").strip()
    if not transcript:
        raise RuntimeError("Gemini returned an empty transcript")
    return transcript


def _source_ingredient_display(ingredient) -> str:
    return " ".join(part for part in (ingredient.qty, ingredient.unit, ingredient.name) if part)


_VARIABLE_FORMULATION_PATTERN = re.compile(
    r"\b(?:sauce|condiment|seasoning|stock|broth|bouillon|paste|mix|dressing|marinade)\b",
    re.IGNORECASE,
)
_EXPLICIT_GLUTEN_SOURCE_PATTERN = re.compile(
    r"\b(?:wheat|barley|rye|malt|spelt|flour|breadcrumbs?|bread|pasta|couscous|"
    r"semolina|seitan|soy\s+sauce|teriyaki)\b",
    re.IGNORECASE,
)
_GLUTEN_FREE_PATTERN = re.compile(r"\bgluten[-\s]?free\b", re.IGNORECASE)


def _repair_shopping_list_categories(
    values: list[str],
    ingredient_count: int,
    component_index: int,
    repairs: list[str],
) -> list[ShoppingCategory]:
    if len(values) != ingredient_count:
        repairs.append(
            f"component {component_index} shopping_list_categories has {len(values)} entries, "
            f"expected {ingredient_count}"
        )

    categories: list[ShoppingCategory] = []
    for ingredient_index in range(ingredient_count):
        value = values[ingredient_index] if ingredient_index < len(values) else None
        try:
            categories.append(ShoppingCategory(value))
        except (TypeError, ValueError):
            repairs.append(
                f"component {component_index} shopping_list_categories[{ingredient_index}] is invalid"
            )
            categories.append(ShoppingCategory.OTHER)
    return categories


def _repair_enrichment_alignment(
    source: RecipeSourceExtraction,
    enrichment: RecipeEnrichment,
) -> RecipeEnrichment:
    """Use source-derived values only for malformed parallel enrichment fields."""
    repaired_components: list[EnrichmentComponent] = []
    repairs: list[str] = []

    if len(enrichment.components) != len(source.components):
        repairs.append(
            f"components has {len(enrichment.components)} entries, expected {len(source.components)}"
        )

    for index, source_component in enumerate(source.components):
        component = enrichment.components[index] if index < len(enrichment.components) else EnrichmentComponent()
        ingredient_fallback = [_source_ingredient_display(ingredient) for ingredient in source_component.ingredients]
        def aligned_or_fallback(field_name: str, values: list[str], fallback: list[str]) -> list[str]:
            if len(values) == len(fallback):
                return values
            repairs.append(
                f"component {index} {field_name} has {len(values)} entries, expected {len(fallback)}"
            )
            return fallback

        repaired_components.append(component.model_copy(update={
            "shopping_list_values": aligned_or_fallback(
                "shopping_list_values", component.shopping_list_values, ingredient_fallback,
            ),
            "shopping_list_categories": _repair_shopping_list_categories(
                component.shopping_list_categories,
                len(ingredient_fallback),
                index,
                repairs,
            ),
        }))

    if repairs:
        log.warning("Repaired Gemini enrichment alignment with source fallbacks: %s", "; ".join(repairs))
    return enrichment.model_copy(update={"components": repaired_components})


async def _enrich_recipe(
    source: RecipeSourceExtraction,
    available_tags: list[str] | None,
    generous: bool,
    usage: UsageTracker | None,
    *,
    source_faithful: bool = False,
    requested_estimates: set[str] | None = None,
) -> RecipeEnrichment:
    prompt = {"source_recipe": source.model_dump(mode="json")}
    if source_faithful:
        prompt["missing_fields"] = sorted(requested_estimates or set())
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

        request = _with_retry(
            lambda: client.models.generate_content(
                model=_DEFAULT_MECHANICAL_MODEL,
                contents=json.dumps(attempt_prompt, ensure_ascii=False),
                config=types.GenerateContentConfig(
                    system_instruction=(
                        _ENRICHMENT_SYSTEM + "\n\n" +
                        "For this source-faithful request, estimate only the exact fields listed in "
                        "missing_fields. Source fields in source_recipe are read-only context. Return null "
                        "for every unrequested numeric field. Estimate time only when requested and do not "
                        "add times or temperatures to steps. Return null nutrition when ingredient amounts "
                        "or unknown component composition make an estimate unreliable. The overview must "
                        "summarize only provided steps, and must be null when there are no steps."
                        if source_faithful else _ENRICHMENT_SYSTEM
                    ),
                    temperature=0,
                    response_mime_type="application/json",
                    response_schema=RecipeEnrichment,
                ),
            ),
            generous=generous,
            max_attempts=3 if source_faithful else 200,
        )
        response = await asyncio.wait_for(request, timeout=45) if source_faithful else await request
        if usage is not None:
            usage.add(response)

        try:
            enrichment = RecipeEnrichment.model_validate(json.loads(response.text))
            has_recipe_content = any(
                component.ingredients or component.steps
                for component in source.components
            )
            if has_recipe_content and not source_faithful and enrichment.total_time_minutes is None:
                raise ValueError(
                    "total_time_minutes must be calculated for a recipe with content"
                )
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
            continue

        # Alignment errors are recoverable without another model call: retain
        # every well-formed derived field and use canonical source data only for
        # the malformed parallel fields.
        if source_faithful:
            permitted = requested_estimates or set()
            updates = {
                field: getattr(enrichment, field) if field in permitted else None
                for field in ("total_time_minutes", "kcal_per_serving", "protein_per_serving", "fat_per_serving", "carbs_per_serving")
            }
            if not any(component.steps for component in source.components):
                updates["overview"] = None
            enrichment = enrichment.model_copy(update=updates)
        return _repair_enrichment_alignment(source, enrichment)

    raise AssertionError("unreachable")


def assemble_recipe(
    source: RecipeSourceExtraction,
    enrichment: RecipeEnrichment,
    step_ingredient_lines: list[list[int | None]] | None = None,
) -> RecipeExtraction:
    if len(enrichment.components) != len(source.components):
        raise ValueError(
            f"Enrichment returned {len(enrichment.components)} components, "
            f"expected {len(source.components)}"
        )

    if step_ingredient_lines is None:
        step_ingredient_lines = [[None] * len(component.steps) for component in source.components]
    if len(step_ingredient_lines) != len(source.components):
        raise ValueError(
            f"Step matching returned {len(step_ingredient_lines)} components, "
            f"expected {len(source.components)}"
        )

    components: list[RecipeComponent] = []
    for index, (source_component, enriched) in enumerate(zip(source.components, enrichment.components)):
        ingredient_count = len(source_component.ingredients)
        step_count = len(source_component.steps)

        if len(enriched.shopping_list_values) != ingredient_count:
            raise ValueError(
                f"Component {index}: shopping_list_values has {len(enriched.shopping_list_values)} entries, "
                f"expected {ingredient_count}"
            )

        component_step_lines = step_ingredient_lines[index]
        if len(component_step_lines) != step_count:
            raise ValueError(
                f"Component {index}: step_ingredient_line has {len(component_step_lines)} entries, "
                f"expected {step_count}"
            )

        category_repairs: list[str] = []
        shopping_categories = _repair_shopping_list_categories(
            enriched.shopping_list_categories,
            ingredient_count,
            index,
            category_repairs,
        )
        if category_repairs:
            log.warning(
                "Repaired recipe component shopping categories: %s",
                "; ".join(category_repairs),
            )

        ingredients = [
            Ingredient(
                qty=ingredient.qty,
                unit=ingredient.unit,
                name=ingredient.name,
                shopping_list_value=shopping_value,
                shopping_list_category=shopping_category,
            )
            for ingredient, shopping_value, shopping_category in zip(
                source_component.ingredients,
                enriched.shopping_list_values,
                shopping_categories,
            )
        ]
        components.append(RecipeComponent(
            role=source_component.role,
            name=source_component.name,
            yield_note=source_component.yield_note,
            ingredients=ingredients,
            steps=source_component.steps,
            **build_variants(
                [_source_ingredient_display(value) for value in source_component.ingredients],
                source_component.steps,
            ),
            shopping_list_categories=shopping_categories,
            step_ingredient_line=component_step_lines,
        ))

    return RecipeExtraction(
        title=source.title,
        servings=source.servings,
        total_time_minutes=source.total_time_minutes if source.total_time_minutes is not None else enrichment.total_time_minutes,
        kcal_per_serving=enrichment.kcal_per_serving,
        protein_per_serving=enrichment.protein_per_serving,
        fat_per_serving=enrichment.fat_per_serving,
        carbs_per_serving=enrichment.carbs_per_serving,
        overview=enrichment.overview,
        tags=enrichment.tags,
        components=components,
    )


def _source_number(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(?<!\w)(\d+(?:[.,]\d+)?)", value)
    if match is None:
        return None
    try:
        return round(float(match.group(1).replace(",", ".")))
    except ValueError:
        return None


async def enrich_v2_recipe(
    extracted,
    available_tags: list[str] | None = None,
    allergens: list[str] | None = None,
    usage: UsageTracker | None = None,
) -> RecipeExtraction:
    """Enrich v2 evidence while keeping its canonical facts immutable."""
    parsed_components = [
        [parse_ingredient(item.text) for item in component.ingredients]
        for component in extracted.components
    ]
    components = [
        SourceComponent(
            name=component.name,
            ingredients=[
                _v2_source_ingredient(parsed, item.text)
                for item, parsed in zip(component.ingredients, parsed_component)
            ],
            steps=[step.text for step in component.steps],
        )
        for component, parsed_component in zip(extracted.components, parsed_components)
    ]
    servings = _source_number(extracted.yield_servings)
    nutrition = extracted.nutrition
    source_values = {
        "kcal_per_serving": _source_number(nutrition.calories),
        "protein_per_serving": _source_number(nutrition.protein),
        "fat_per_serving": _source_number(nutrition.fat),
        "carbs_per_serving": _source_number(nutrition.carbohydrates),
    }
    source = RecipeSourceExtraction(
        title=extracted.title,
        servings=servings,
        total_time_minutes=extracted.total_time_minutes,
        **source_values,
        composition_unknown=any(item.links for component in extracted.components for item in component.ingredients),
        components=components,
    )
    missing_fields = {
        field for field, value in {
            "total_time_minutes": extracted.total_time_minutes,
            **source_values,
        }.items() if value is None
    }
    if source.composition_unknown:
        missing_fields -= {"kcal_per_serving", "protein_per_serving", "fat_per_serving", "carbs_per_serving"}
    enrichment, step_matches = await asyncio.gather(
        _enrich_recipe(source, available_tags, False, usage,
                       source_faithful=True, requested_estimates=missing_fields),
        _match_source_step_ingredient_lines_safely(source, False, usage),
    )
    assembled = assemble_recipe(source, enrichment, step_matches)
    assembled.title = extracted.title
    assembled.source_title = extracted.title
    assembled.total_time_minutes = extracted.total_time_minutes or enrichment.total_time_minutes
    assembled.kcal_per_serving = source_values["kcal_per_serving"] if source_values["kcal_per_serving"] is not None else enrichment.kcal_per_serving
    assembled.protein_per_serving = source_values["protein_per_serving"] if source_values["protein_per_serving"] is not None else enrichment.protein_per_serving
    assembled.fat_per_serving = source_values["fat_per_serving"] if source_values["fat_per_serving"] is not None else enrichment.fat_per_serving
    assembled.carbs_per_serving = source_values["carbs_per_serving"] if source_values["carbs_per_serving"] is not None else enrichment.carbs_per_serving
    assembled.nutrition_provenance = {
        field: ({"status": "source", "references": [ref.model_dump(mode="json") for ref in nutrition.references]}
                if source_values[field] is not None else
                {"status": "ai"} if getattr(enrichment, field) is not None else {"status": "unknown"})
        for field in source_values
    }
    if source.composition_unknown:
        for field in source_values:
            if source_values[field] is None:
                setattr(assembled, field, None)
                assembled.nutrition_provenance[field] = {"status": "unknown"}
    nutrition_values = [assembled.kcal_per_serving, assembled.protein_per_serving,
                        assembled.fat_per_serving, assembled.carbs_per_serving]
    assembled.nutrition_status = "complete" if all(value is not None for value in nutrition_values) else "incomplete" if any(value is not None for value in nutrition_values) else "unknown"
    assembled.total_time_provenance = (
        {"status": "source", "references": [ref.model_dump(mode="json") for ref in extracted.total_time_references]}
        if extracted.total_time_minutes is not None else
        {"status": "ai"} if enrichment.total_time_minutes is not None else {"status": "unknown"}
    )
    assembled.title_evidence = [ref.model_dump(mode="json") for ref in extracted.title_references]
    if not any(component.steps for component in extracted.components):
        assembled.overview = None
    assembled.components = [
        output.model_copy(update={
            "ingredients": [
                _v2_parsed_ingredient(parsed, item.text, derived.shopping_list_category)
                for item, parsed, derived in zip(
                    source_component.ingredients,
                    parsed_component,
                    output.ingredients,
                )
            ],
            "steps": [item.text for item in source_component.steps],
            "ingredient_links": [item.link_url for item in source_component.ingredients],
            "ingredient_evidence": [{
                "references": [ref.model_dump(mode="json") for ref in item.references],
                "links": [link.model_dump(mode="json") for link in item.links],
            } for item in source_component.ingredients],
            "step_evidence": [{"references": [ref.model_dump(mode="json") for ref in item.references]}
                              for item in source_component.steps],
            "name_evidence": [ref.model_dump(mode="json") for ref in source_component.name_references],
        })
        for output, source_component, parsed_component in zip(
            assembled.components, extracted.components, parsed_components
        )
    ]
    if allergens:
        allergen_results = await asyncio.gather(*(
            analyze_allergens([_source_ingredient_display(ingredient) for ingredient in component.ingredients], allergens, usage=usage)
            for component in assembled.components
        ))
        assembled.components = [component.model_copy(update={
            "ingredients": [ingredient.model_copy(update={
                "allergen": flag.allergen, "substitute": flag.substitute,
            }) for ingredient, flag in zip(component.ingredients, flags)],
        }) for component, flags in zip(assembled.components, allergen_results)]
        assembled.allergen_status = "uncertain" if any(
            ingredient.links for component in extracted.components for ingredient in component.ingredients
        ) else "analyzed"
    elif any(ingredient.links for component in extracted.components for ingredient in component.ingredients):
        assembled.allergen_status = "uncertain"
    return assembled


_IMAGE_TRANSCRIPTION_PROMPT = """\
Transcribe only text visibly present in this image, in its original language.
Preserve headings, line breaks, punctuation, numbers, and reading order. For
handwriting or unclear print, mark only the uncertain characters or words with
[unclear]; do not guess. Include visible non-recipe text as written. Do not
extract or organize recipe facts, infer missing words or steps, translate,
summarize, convert units, or explain the image. Return plain text only. If no
text is legible, return an empty response.
"""


async def transcribe_image_text(
    image_data: bytes,
    mime_type: str,
    model: str | None = None,
    usage: UsageTracker | None = None,
) -> str:
    """One vision request per job attempt; the job handles transient retries."""
    client = _build_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model or settings.gemini_extraction_model,
        contents=[types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_data)), _IMAGE_TRANSCRIPTION_PROMPT],
        config=types.GenerateContentConfig(temperature=0, response_mime_type="text/plain"),
    )
    if usage is not None:
        usage.add(response)
    return (response.text or "").strip()


class _StepIngredientReference(BaseModel):
    ingredient_index: int
    evidence: str


class _StepIngredientMatch(BaseModel):
    component_index: int
    step_index: int
    references: list[_StepIngredientReference]


class _StepIngredientMatchResult(BaseModel):
    matches: list[_StepIngredientMatch]


def _source_step_match_components(source: RecipeSourceExtraction) -> list[dict[str, Any]]:
    return [
        {
            "steps": component.steps,
            "ingredients": [_source_ingredient_display(ingredient) for ingredient in component.ingredients],
        }
        for component in source.components
    ]


async def _match_source_step_ingredient_lines_safely(
    source: RecipeSourceExtraction,
    generous: bool,
    usage: UsageTracker | None,
) -> list[list[int | None]]:
    components = _source_step_match_components(source)
    try:
        return await match_recipe_step_ingredient_lines(components, generous=generous, usage=usage)
    except Exception:
        log.exception("Step ingredient matching failed; continuing without rail targets")
        return [[None] * len(component.steps) for component in source.components]


def _step_match_keys(components: list[dict[str, Any]]) -> set[tuple[int, int]]:
    return {
        (component_index, step_index)
        for component_index, component in enumerate(components)
        for step_index, _ in enumerate(component.get("steps") or [])
    }


def _step_match_prompt(
    components: list[dict[str, Any]],
    keys: set[tuple[int, int]],
    retry_reason: str | None = None,
) -> dict[str, Any]:
    prompt_components = []
    for component_index, component in enumerate(components):
        steps = [
            {"index": step_index, "text": step}
            for step_index, step in enumerate(component.get("steps") or [])
            if (component_index, step_index) in keys
        ]
        if not steps:
            continue
        ingredients = [
            {"index": ingredient_index, "text": ingredient}
            for ingredient_index, ingredient in enumerate(component.get("ingredients") or [])
        ]
        prompt_components.append({
            "component_index": component_index,
            "steps": steps,
            "ingredients": ingredients,
        })

    prompt: dict[str, Any] = {"components": prompt_components}
    if retry_reason:
        prompt["retry_reason"] = retry_reason
    return prompt


_STEP_MATCH_STOP_WORDS = {
    "and", "can", "cup", "for", "from", "into", "of", "or", "the", "then", "with",
    "tbsp", "tsp", "oz", "ml", "g", "kg", "lb", "lbs", "clove", "pinch",
}


def _normalized_words(value: str) -> list[str]:
    return [
        word for word in re.findall(r"\w+", value.casefold())
        if len(word) > 2 and not word.isnumeric() and word not in _STEP_MATCH_STOP_WORDS
    ]


def _words_are_related(left: str, right: str) -> bool:
    if left == right:
        return True
    common_length = min(len(left), len(right))
    return common_length >= 4 and left[:common_length] == right[:common_length]


def _reference_is_grounded(step: str, ingredient: str, evidence: str) -> bool:
    normalized_step = " ".join(_normalized_words(step))
    normalized_evidence = " ".join(_normalized_words(evidence))
    if not normalized_evidence or normalized_evidence not in normalized_step:
        return False

    evidence_words = _normalized_words(evidence)
    ingredient_words = _normalized_words(ingredient)
    return any(
        _words_are_related(evidence_word, ingredient_word)
        for evidence_word in evidence_words
        for ingredient_word in ingredient_words
    )


def _has_grounded_candidate(step: str, ingredients: list[str]) -> bool:
    return any(
        any(
            _words_are_related(step_word, ingredient_word)
            for step_word in _normalized_words(step)
            for ingredient_word in _normalized_words(ingredient)
        )
        for ingredient in ingredients
    )


def _validate_step_matches(
    result: _StepIngredientMatchResult,
    components: list[dict[str, Any]],
    expected_keys: set[tuple[int, int]],
) -> tuple[dict[tuple[int, int], int | None], set[tuple[int, int]]]:
    matches_by_key: dict[tuple[int, int], _StepIngredientMatch] = {}
    invalid_keys: set[tuple[int, int]] = set()
    for match in result.matches:
        key = (match.component_index, match.step_index)
        if key not in expected_keys or key in matches_by_key:
            if key in expected_keys:
                invalid_keys.add(key)
            continue
        matches_by_key[key] = match

    lines: dict[tuple[int, int], int | None] = {}
    for key in expected_keys:
        if key in invalid_keys:
            continue

        component_index, step_index = key
        match = matches_by_key.get(key)
        if match is None:
            invalid_keys.add(key)
            continue

        component = components[component_index]
        step = (component.get("steps") or [])[step_index]
        ingredients = component.get("ingredients") or []
        if not match.references:
            lines[key] = None
            if _has_grounded_candidate(step, ingredients):
                invalid_keys.add(key)
            continue

        ingredient_indices = [reference.ingredient_index for reference in match.references]
        references_valid = len(set(ingredient_indices)) == len(ingredient_indices)
        for reference in match.references:
            if not (0 <= reference.ingredient_index < len(ingredients)):
                references_valid = False
                break
            ingredient = ingredients[reference.ingredient_index]
            if not _reference_is_grounded(step, ingredient, reference.evidence):
                references_valid = False
                break
        if not references_valid:
            invalid_keys.add(key)
            continue

        sorted_indices = sorted(ingredient_indices)
        lines[key] = sorted_indices[(len(sorted_indices) - 1) // 2]

    return lines, invalid_keys


async def _request_step_matches(
    components: list[dict[str, Any]],
    keys: set[tuple[int, int]],
    model: str,
    generous: bool,
    usage: UsageTracker | None,
    retry_reason: str | None = None,
) -> _StepIngredientMatchResult:
    client = _build_client()
    prompt = _step_match_prompt(components, keys, retry_reason)
    response = await _with_retry(
        lambda: client.models.generate_content(
            model=model,
            contents=json.dumps(prompt, ensure_ascii=False),
            config=types.GenerateContentConfig(
                system_instruction=_STEP_INGREDIENT_MATCH_INSTRUCTION,
                temperature=0,
                response_mime_type="application/json",
                response_schema=_StepIngredientMatchResult,
            ),
        ),
        generous=generous,
    )
    if usage is not None:
        usage.add(response)
    return _StepIngredientMatchResult.model_validate(json.loads(response.text))


async def match_recipe_step_ingredient_lines(
    components: list[dict[str, Any]],
    model: str = _STEP_INGREDIENT_MATCH_MODEL,
    generous: bool = False,
    usage: UsageTracker | None = None,
) -> list[list[int | None]]:
    keys = _step_match_keys(components)
    lines_by_component = [
        [None] * len(component.get("steps") or [])
        for component in components
    ]
    if not keys:
        return lines_by_component

    result = await _request_step_matches(components, keys, model, generous, usage)
    lines, invalid_keys = _validate_step_matches(result, components, keys)
    if invalid_keys:
        retry_result = await _request_step_matches(
            components,
            invalid_keys,
            model,
            generous,
            usage,
            "Some previous matches were missing, duplicated, or not grounded in exact step text. Re-evaluate them.",
        )
        retry_lines, still_invalid = _validate_step_matches(retry_result, components, invalid_keys)
        lines.update(retry_lines)
        if still_invalid:
            for key in still_invalid:
                lines[key] = None
            log.warning("Step ingredient matching left these steps unmatched after retry: %s", sorted(still_invalid))

    for (component_index, step_index), line in lines.items():
        lines_by_component[component_index][step_index] = line
    return lines_by_component


async def match_step_ingredient_lines(
    steps: list[str],
    ingredient_names: list[str],
    model: str = _STEP_INGREDIENT_MATCH_MODEL,
) -> list[int | None]:
    lines_by_component = await match_recipe_step_ingredient_lines(
        [{"steps": steps, "ingredients": ingredient_names}],
        model=model,
    )
    return lines_by_component[0]


class _IngredientFlag(BaseModel):
    allergen: str | None = None
    substitute: str | None = None


class _AllergenAnalysisResult(BaseModel):
    results: list[_IngredientFlag]


class _ShoppingListValuesResult(BaseModel):
    values: list[str]



class _ShoppingListCategoriesResult(BaseModel):
    categories: list[ShoppingCategory]


def _discard_unsubstantiated_allergen_flags(
    ingredients: list[str],
    flags: list[_IngredientFlag],
) -> list[_IngredientFlag]:
    filtered: list[_IngredientFlag] = []
    for ingredient, flag in zip(ingredients, flags):
        is_uncertain_gluten_product = (
            flag.allergen in {"gluten", "ncgs"}
            and _VARIABLE_FORMULATION_PATTERN.search(ingredient)
            and not _EXPLICIT_GLUTEN_SOURCE_PATTERN.search(ingredient)
        )
        if _GLUTEN_FREE_PATTERN.search(ingredient) or is_uncertain_gluten_product:
            filtered.append(_IngredientFlag())
        else:
            filtered.append(flag)
    return filtered


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


async def recommend_shopping_list_categories(
    ingredients: list[str],
    model: str = _DEFAULT_MECHANICAL_MODEL,
) -> list[ShoppingCategory]:
    if not ingredients:
        return []

    numbered = "\n".join(f"{index + 1}. {ingredient}" for index, ingredient in enumerate(ingredients))
    category_lines = "\n".join(
        f"- {category}: {meaning}"
        for category, meaning in _SHOPPING_CATEGORY_MEANINGS.items()
    )
    instruction = (
        "Classify each ingredient into exactly one shopping category. Return categories in "
        "exactly the same order as the input. Return only these stable IDs, never localized "
        f"labels or invented IDs:\n{category_lines}"
    )
    client = _build_client()
    response = await _with_retry(lambda: client.models.generate_content(
        model=model,
        contents=numbered,
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=_ShoppingListCategoriesResult,
        ),
    ))
    result = _ShoppingListCategoriesResult.model_validate(json.loads(response.text))
    if len(result.categories) != len(ingredients):
        raise RuntimeError("Gemini returned the wrong number of shopping-list categories")
    return result.categories


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
    return _discard_unsubstantiated_allergen_flags(
        ingredients,
        flags[:len(ingredients)],
    )
