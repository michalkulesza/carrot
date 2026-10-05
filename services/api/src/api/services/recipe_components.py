"""Serialize extracted components consistently for imports and reimports."""

from api.models import RecipeExtraction, ShoppingCategory


def serialize_components(extraction: RecipeExtraction, auto_substitute: bool) -> list[dict]:
    components = []
    for component in extraction.components:
        original = [" ".join(part for part in (
            ingredient.qty, ingredient.unit.value if ingredient.unit else None, ingredient.name,
        ) if part) for ingredient in component.ingredients]
        value = {
            "name": component.name or "",
            "yield_note": component.yield_note or "",
            "ingredients": original.copy(),
            "shopping_list_ingredients": [ingredient.shopping_list_value or display
                                          for ingredient, display in zip(component.ingredients, original)],
            "shopping_list_categories": [ingredient.shopping_list_category or ShoppingCategory.OTHER
                                         for ingredient in component.ingredients],
            "steps": component.steps,
            "metric_ingredients": list(component.metric_ingredients or original),
            "imperial_ingredients": list(component.imperial_ingredients or original),
            "metric_steps": component.metric_steps or component.steps,
            "imperial_steps": component.imperial_steps or component.steps,
            "ingredient_flags": [],
            "step_ingredient_line": component.step_ingredient_line,
            "ingredient_links": component.ingredient_links,
            "ingredient_evidence": component.ingredient_evidence,
            "step_evidence": component.step_evidence,
            "name_evidence": component.name_evidence,
        }
        for index, ingredient in enumerate(component.ingredients):
            applied = bool(auto_substitute and ingredient.allergen and ingredient.substitute)
            originals = None
            if applied:
                originals = {}
                for field in ("shopping_list_ingredients", "metric_ingredients", "imperial_ingredients"):
                    # A replacement is full ingredient text, including its own measurements.
                    originals[field] = value[field][index] if index < len(value[field]) else original[index]
                    if index >= len(value[field]):
                        value[field].extend(original[len(value[field]):])
                    value[field][index] = ingredient.substitute
                value["ingredients"][index] = ingredient.substitute
            value["ingredient_flags"].append({
                "allergen": ingredient.allergen, "substitute": ingredient.substitute,
                "substitute_applied": applied,
                "original_display": original[index] if applied else None,
                "original_values": originals,
            })
        components.append(value)
    return components
