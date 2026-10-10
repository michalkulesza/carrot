import argparse
import asyncio
import uuid

from sqlalchemy import select

from api.database import async_session_maker
from api.models import Recipe
from api.services.linked_recipes import (
    _household_recipes_by_url,
    existing_linked_ids,
    is_component_recipe,
    linked_urls,
    linking_household_id,
    spawn_linked_imports,
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


async def main(apply: bool, recipe_ids: set[uuid.UUID]) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id).order_by(Recipe.created_at)
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        all_ids = list((await session.scalars(statement)).all())

    queued = 0
    for recipe_id in all_ids:
        async with async_session_maker() as session:
            recipe = await session.get(Recipe, recipe_id)
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

    print(f"Queued {queued} child import job(s)." if apply else "Dry run: pass --apply to write the plan above.")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(description="Link existing recipes to the recipes their ingredient lines reference.")
    parser.add_argument("--apply", action="store_true", help="Attach existing recipes and queue child imports")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only process this recipe UUID; repeatable")
    args = parser.parse_args()
    asyncio.run(main(args.apply, {uuid.UUID(value) for value in args.recipe_id}))
