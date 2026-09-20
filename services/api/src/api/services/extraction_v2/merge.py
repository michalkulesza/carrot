"""Conservative recipe evidence merging without inventing source facts."""

from __future__ import annotations

import re

from api.services.extraction_v2.contracts import ExtractedRecipe, RecipeComponentEvidence


def _key(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def has_ingredients(recipe: ExtractedRecipe) -> bool:
    return any(component.ingredients for component in recipe.components)


def has_instructions(recipe: ExtractedRecipe) -> bool:
    return any(step.text.strip() for component in recipe.components for step in component.steps)


def recipes_can_merge(left: ExtractedRecipe, right: ExtractedRecipe) -> bool:
    if not left.title or not right.title:
        return True
    return _key(left.title) == _key(right.title)


def merge_recipes(left: ExtractedRecipe, right: ExtractedRecipe) -> ExtractedRecipe:
    """Merge complementary components and exact duplicates while retaining all evidence IDs."""

    components = [component.model_copy(deep=True) for component in left.components]
    by_name = {_key(component.name or "main"): component for component in components}
    for incoming in right.components:
        component = by_name.get(_key(incoming.name or "main"))
        if component is None:
            component = RecipeComponentEvidence(name=incoming.name)
            components.append(component)
            by_name[_key(incoming.name or "main")] = component
        existing_ingredients = {_key(item.text): item for item in component.ingredients}
        for ingredient in incoming.ingredients:
            current = existing_ingredients.get(_key(ingredient.text))
            if current is None:
                component.ingredients.append(ingredient.model_copy(deep=True))
                existing_ingredients[_key(ingredient.text)] = component.ingredients[-1]
            else:
                current.evidence_ids = list(dict.fromkeys([*current.evidence_ids, *ingredient.evidence_ids]))
        existing_steps = {_key(item.text): item for item in component.steps}
        for step in incoming.steps:
            current = existing_steps.get(_key(step.text))
            if current is None:
                component.steps.append(step.model_copy(deep=True))
                existing_steps[_key(step.text)] = component.steps[-1]
            else:
                current.evidence_ids = list(dict.fromkeys([*current.evidence_ids, *step.evidence_ids]))
    return ExtractedRecipe(
        title=left.title or right.title,
        components=components,
        yield_text=left.yield_text or right.yield_text,
        yield_servings=left.yield_servings or right.yield_servings,
        yield_evidence_ids=left.yield_evidence_ids or right.yield_evidence_ids,
        yield_references=left.yield_references or right.yield_references,
        total_time_minutes=left.total_time_minutes or right.total_time_minutes,
        total_time_text=left.total_time_text or right.total_time_text,
        total_time_evidence_ids=left.total_time_evidence_ids or right.total_time_evidence_ids,
        total_time_references=left.total_time_references or right.total_time_references,
        nutrition=left.nutrition or right.nutrition,
        failure_reason=left.failure_reason or right.failure_reason,
    )
