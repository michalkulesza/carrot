import argparse
import asyncio
import uuid

from sqlalchemy import select

from api.database import async_session_maker
from api.models import ImportJob, ImportJobStatus, Recipe
from api.services import allergen_rechecks
from api.services.linked_recipes import (
    NON_RECIPE_FAILURE_CODES,
    _household_recipes_by_url,
    existing_linked_ids,
    external_urls,
    is_component_recipe,
    linked_urls,
    linking_household_id,
    normalize_link,
    spawn_linked_imports,
    with_link_kinds,
)
from api.services.monitoring import init_sentry


def has_unresolved_link(recipe: Recipe) -> bool:
    for component in recipe.components or []:
        links = component.get("ingredient_links") or []
        ids = list(component.get("linked_recipe_ids") or [])
        ids += [None] * (len(links) - len(ids))
        if any(link and not recipe_id for link, recipe_id in zip(links, ids)):
            return True
    return False


async def _plan(session, recipe: Recipe) -> tuple[uuid.UUID | None, list[str], str]:
    household_id = await linking_household_id(session, recipe.id)
    if recipe.author_id is None or household_id is None:
        return None, [], "skip: missing author or household"
    if await is_component_recipe(session, recipe):
        return None, [], "skip: component recipe"

    resolved = existing_linked_ids(recipe.components or [])
    urls = [url for url in linked_urls(recipe.components or [], recipe.source_url) if url not in resolved]
    if not urls:
        return None, [], "skip: no unresolved links"

    existing = await _household_recipes_by_url(session, household_id, urls)
    actions = [f"attach existing {existing[url]}: {url}" if url in existing else f"queue child import: {url}" for url in urls]
    return household_id, actions, "ok"


def has_links(recipe: Recipe) -> bool:
    return any(link for component in recipe.components or [] for link in component.get("ingredient_links") or [])


async def _failed_non_recipe_urls(session, recipe: Recipe) -> set[str]:
    inputs = await session.scalars(
        select(ImportJob.input).where(
            ImportJob.parent_recipe_id == recipe.id,
            ImportJob.status == ImportJobStatus.FAILED,
            ImportJob.failure_code.in_(NON_RECIPE_FAILURE_CODES),
        )
    )
    return {url for value in inputs.all() if (url := normalize_link((value or {}).get("url")))}


def _kind_changes(old_components: list[dict], new_components: list[dict]) -> list[str]:
    changes = []
    for old, new in zip(old_components, new_components):
        old_kinds = old.get("ingredient_link_kinds") or []
        for index, (link, kind) in enumerate(zip(new.get("ingredient_links") or [], new["ingredient_link_kinds"])):
            previous = old_kinds[index] if index < len(old_kinds) else None
            if previous != kind:
                changes.append(f"{link}: {previous} -> {kind}")
    return changes


async def refresh_link_kinds(session, recipe: Recipe, apply: bool) -> bool:
    components = recipe.components or []
    non_recipe = await _failed_non_recipe_urls(session, recipe) | external_urls(components)
    refreshed = with_link_kinds(components, recipe.source_url, non_recipe)
    changes = _kind_changes(components, refreshed)
    if not changes:
        return False

    print(f"{recipe.id} {recipe.title}")
    for change in changes:
        print(f"  {change}")
    if apply:
        recipe.components = refreshed
        await allergen_rechecks.enqueue_recipe_allergen_check(session, recipe.id)
        await session.commit()
    return True


async def main(apply: bool, recipe_ids: set[uuid.UUID], refresh_kinds: bool = False) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id).order_by(Recipe.created_at)
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        all_ids = list((await session.scalars(statement)).all())

    queued = 0
    refreshed = 0
    for recipe_id in all_ids:
        async with async_session_maker() as session:
            recipe = await session.get(Recipe, recipe_id)
            if refresh_kinds:
                refreshed += recipe is not None and has_links(recipe) and await refresh_link_kinds(session, recipe, apply)
                continue
            if recipe is None or not has_unresolved_link(recipe):
                continue

            household_id, actions, reason = await _plan(session, recipe)
            print(f"{recipe.id} {recipe.title}: {reason}")
            for action in actions:
                print(f"  {action}")
            if not apply or household_id is None:
                continue

            child_ids = await spawn_linked_imports(session, recipe, user_id=recipe.author_id, household_id=household_id)
            await session.commit()
            queued += len(child_ids)

    if refresh_kinds:
        print(f"Updated link kinds on {refreshed} recipe(s)." if apply else f"Dry run: {refreshed} recipe(s) would change; pass --apply to write.")
        return
    print(f"Queued {queued} child import job(s)." if apply else "Dry run: pass --apply to write the plan above.")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(description="Link existing recipes to the recipes their ingredient lines reference.")
    parser.add_argument("--apply", action="store_true", help="Attach existing recipes and queue child imports")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only process this recipe UUID; repeatable")
    parser.add_argument("--refresh-link-kinds", action="store_true", help="Recompute recipe/external link kinds instead of linking recipes")
    args = parser.parse_args()
    asyncio.run(main(args.apply, {uuid.UUID(value) for value in args.recipe_id}, args.refresh_link_kinds))
