from api.models import ImportResult, Recipe
from api.services.linked_recipes import external_urls, with_link_kinds
from api.services.recipe_components import serialize_components


def apply_extraction(recipe: Recipe, result: ImportResult, auto_substitute: bool) -> None:
    extraction = result.recipe
    if extraction is None:
        raise ValueError("re-import produced no recipe")

    recipe.title = extraction.title or recipe.title
    recipe.source_title = extraction.source_title or extraction.title or recipe.source_title
    recipe.servings = extraction.servings
    recipe.total_time_minutes = extraction.total_time_minutes
    recipe.kcal_per_serving = extraction.kcal_per_serving
    recipe.protein_per_serving = extraction.protein_per_serving
    recipe.fat_per_serving = extraction.fat_per_serving
    recipe.carbs_per_serving = extraction.carbs_per_serving
    recipe.issue_codes = result.issue_codes
    recipe.nutrition_provenance = extraction.nutrition_provenance
    recipe.nutrition_status = extraction.nutrition_status
    recipe.total_time_provenance = extraction.total_time_provenance
    recipe.allergen_status = extraction.allergen_status
    recipe.overview = extraction.overview
    recipe.title_evidence = extraction.title_evidence
    previous_external = external_urls(recipe.components or [])

    if result.metadata.thumbnail_url:
        recipe.thumbnail_url = result.metadata.thumbnail_url
    if result.metadata.creator_handle:
        recipe.creator_handle = result.metadata.creator_handle
    if result.metadata.source_url:
        recipe.source_url = result.metadata.source_url

    components = serialize_components(extraction, auto_substitute)
    recipe.components = with_link_kinds(components, recipe.source_url, previous_external)
