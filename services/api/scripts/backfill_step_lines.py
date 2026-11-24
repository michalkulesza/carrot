import argparse
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from api import users  # noqa: F401  registers the User mapper that Recipe relates to
from api.database import async_session_maker
from api.models import Recipe
from api.services.gemini import match_recipe_step_ingredient_lines
from api.services.monitoring import init_sentry

REQUEST_INTERVAL_SECONDS = 1.0


def _unanchored_components(components: list[dict]) -> list[int]:
    unanchored = []
    for index, component in enumerate(components):
        steps = component.get("steps") or []
        lines = component.get("step_ingredient_line")
        if steps and (lines is None or len(lines) != len(steps) or all(line is None for line in lines)):
            unanchored.append(index)
    return unanchored


def _has_matchable_content(components: list[dict]) -> bool:
    has_steps = any(component.get("steps") for component in components)
    has_ingredients = any(component.get("ingredients") for component in components)
    return has_steps and has_ingredients


def _is_candidate(components: list[dict], force: bool) -> bool:
    if not _has_matchable_content(components):
        return False
    if force:
        return True
    return bool(_unanchored_components(components))


async def _backfill_recipe(recipe_id: uuid.UUID, force: bool) -> tuple[bool, str]:
    async with async_session_maker() as session:
        recipe = await session.get(Recipe, recipe_id)
        if recipe is None:
            return False, f"Skipped {recipe_id}: recipe no longer exists"

        components = recipe.components or []
        if not _is_candidate(components, force):
            return True, f"Skipped {recipe_id}: already populated"

        anchors = await match_recipe_step_ingredient_lines(components)
        for index, component in enumerate(components):
            if not component.get("steps"):
                continue
            component["step_ingredient_line"] = anchors.lines[index]
            component["step_ingredient_component"] = anchors.components[index]

        flag_modified(recipe, "components")
        await session.commit()
        anchored = sum(line is not None for lines in anchors.lines for line in lines)
        return True, f"Backfilled {recipe_id}: {recipe.title} ({anchored} anchored steps)"


async def main(apply: bool, recipe_ids: set[uuid.UUID], force: bool) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id, Recipe.title, Recipe.components)
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        rows = (await session.execute(statement.order_by(Recipe.created_at))).all()

    candidates = [(recipe_id, title, components or []) for recipe_id, title, components in rows if _is_candidate(components or [], force)]

    if not apply:
        for recipe_id, title, components in candidates:
            unanchored = _unanchored_components(components)
            print(f"Would backfill {recipe_id}: {title} ({len(unanchored)} of {len(components)} component(s) without anchors)")
        print(f"Would backfill step anchors for {len(candidates)} of {len(rows)} recipe(s). Run again with --apply to write them.")
        return

    backfilled = 0
    failed = 0
    for position, (recipe_id, title, _) in enumerate(candidates):
        if position:
            await asyncio.sleep(REQUEST_INTERVAL_SECONDS)
        try:
            succeeded, message = await _backfill_recipe(recipe_id, force)
        except Exception as exc:
            succeeded, message = False, f"Skipped {recipe_id}: {title} ({exc})"
        print(message)
        if succeeded:
            backfilled += 1
        else:
            failed += 1

    print(f"Finished: {backfilled} processed, {failed} skipped.")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(
        description="Backfill step_ingredient_line and step_ingredient_component without touching any other field."
    )
    parser.add_argument("--apply", action="store_true", help="Write the computed step anchors to the database")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only backfill this recipe UUID; repeatable")
    parser.add_argument("--force", action="store_true", help="Recompute recipes whose steps already have anchors")
    args = parser.parse_args()
    asyncio.run(main(
        args.apply,
        {uuid.UUID(value) for value in args.recipe_id},
        args.force,
    ))
