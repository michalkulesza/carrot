from __future__ import annotations

from collections.abc import AsyncGenerator, Awaitable
from typing import Any

from api.models import ImportMetadata, ImportResult, ImportStage, RecipeExtraction
from api.services import gemini as gemini_svc
from api.services.monitoring import report_recipe_import_failure

async def _run_gemini(coro: Awaitable[Any], result_out: list) -> AsyncGenerator[dict[str, Any], None]:
    result_out.append(await coro)
    if False:
        yield {}


def _is_complete(recipe: RecipeExtraction) -> bool:
    return any(c.ingredients for c in recipe.components) and any(c.steps for c in recipe.components)


def _stage_event(key: str, label: str) -> dict[str, Any]:
    return {"type": "stage", "key": key, "label": label}


def _done_event(result: ImportResult) -> dict[str, Any]:
    return {"type": "done", "result": result.model_dump()}


def _ingredient_display(ing) -> str:
    parts = [part for part in (ing.qty, ing.unit, ing.name) if part]
    return " ".join(parts) if parts else ing.name


async def _with_allergens(
    result: ImportResult,
    allergens: list[str] | None,
    usage: gemini_svc.UsageTracker | None = None,
) -> ImportResult:
    if not allergens or not result.recipe:
        return result
    updated = []
    for component in result.recipe.components:
        names = [_ingredient_display(ingredient) for ingredient in component.ingredients]
        flags = await gemini_svc.analyze_allergens(names, allergens, usage=usage)
        ingredients = [
            ingredient.model_copy(update={"allergen": flag.allergen, "substitute": flag.substitute})
            for ingredient, flag in zip(component.ingredients, flags)
        ]
        updated.append(component.model_copy(update={"ingredients": ingredients}))
    return result.model_copy(update={"recipe": result.recipe.model_copy(update={"components": updated})})

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
