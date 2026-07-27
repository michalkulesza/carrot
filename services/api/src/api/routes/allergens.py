from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.constants import ALLERGENS
from api.database import get_async_session
from api.models import AllergenFlag, Recipe
from api.routes.context import get_active_household_id
from api.routes.recipes import _recipe_filter
from api.services import gemini as gemini_svc
from api.users import User, current_active_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/allergens", tags=["allergens"])


def _get_ingredient_strings(components: list) -> list[tuple[int, int, str]]:
    """Return (comp_idx, ing_idx, display_string) for each ingredient."""
    result = []
    for ci, comp in enumerate(components):
        ingredients = comp.get("ingredients", []) if isinstance(comp, dict) else []
        for ii, ing in enumerate(ingredients):
            if isinstance(ing, str):
                result.append((ci, ii, ing))
            elif isinstance(ing, dict):
                result.append((ci, ii, ing.get("name", "")))
    return result


@router.post("/reanalyze")
async def reanalyze_allergens(
    user: User = Depends(current_active_user),
    household_id: uuid.UUID = Depends(get_active_household_id),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    query = select(Recipe).where(_recipe_filter(household_id))

    result = await session.execute(query)
    recipes = result.scalars().all()

    async def generate():
        total = len(recipes)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"

        for i, recipe in enumerate(recipes):
            try:
                components = list(recipe.components) if recipe.components else []
                flat = _get_ingredient_strings(components)

                if flat:
                    ing_strings = [s for _, _, s in flat]
                    flags = await gemini_svc.analyze_allergens(ing_strings, ALLERGENS)

                    new_components = [dict(c) if isinstance(c, dict) else c for c in components]
                    for (ci, ii, _), flag in zip(flat, flags):
                        comp = new_components[ci]
                        if not isinstance(comp, dict):
                            continue
                        comp_flags = list(comp.get("ingredient_flags") or [None] * len(comp.get("ingredients", [])))
                        while len(comp_flags) < len(comp.get("ingredients", [])):
                            comp_flags.append(None)
                        existing = comp_flags[ii] or {}
                        if isinstance(existing, dict):
                            sub_applied = existing.get("substitute_applied", False)
                            orig_display = existing.get("original_display")
                        else:
                            sub_applied = False
                            orig_display = None
                        comp_flags[ii] = AllergenFlag(
                            allergen=flag.allergen,
                            substitute=flag.substitute,
                            substitute_applied=sub_applied,
                            original_display=orig_display,
                        ).model_dump()
                        comp["ingredient_flags"] = comp_flags

                    recipe.components = new_components
                    session.add(recipe)
                    await session.commit()

            except Exception as exc:
                log.warning("Failed to analyze recipe %s: %s", recipe.id, exc)

            yield f"data: {json.dumps({'type': 'progress', 'done': i + 1, 'total': total})}\n\n"

        yield f"data: {json.dumps({'type': 'complete', 'analyzed': total})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
