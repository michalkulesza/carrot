import argparse
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from api import users
from api.database import async_session_maker
from api.models import Recipe
from api.services.gemini import match_step_ingredient_lines
from api.services.monitoring import init_sentry


def _needs_backfill(component: dict, force: bool) -> bool:
    if force:
        return True
    steps = component.get("steps") or []
    line = component.get("step_ingredient_line")
    return line is None or len(line) != len(steps)


async def _backfill_recipe(recipe_id: uuid.UUID, force: bool) -> tuple[bool, str]:
    async with async_session_maker() as session:
        recipe = await session.get(Recipe, recipe_id)
        if recipe is None:
            return False, f"Skipped {recipe_id}: recipe no longer exists"

        components = recipe.components or []
        changed = False
        for component in components:
            steps = component.get("steps") or []
            ingredients = component.get("ingredients") or []
            if not steps or not ingredients:
                if component.get("step_ingredient_line") != [None] * len(steps):
                    component["step_ingredient_line"] = [None] * len(steps)
                    changed = True
                continue
            if not _needs_backfill(component, force):
                continue

            component["step_ingredient_line"] = await match_step_ingredient_lines(steps, ingredients)
            changed = True

        if not changed:
            return True, f"Skipped {recipe_id}: already populated"

        flag_modified(recipe, "components")
        await session.commit()
        return True, f"Backfilled {recipe_id}: {recipe.title}"


async def main(apply: bool, recipe_ids: set[uuid.UUID], force: bool) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id, Recipe.title)
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        recipe_rows = list((await session.execute(statement.order_by(Recipe.created_at))).all())

    if not apply:
        print(f"Would backfill step_ingredient_line for {len(recipe_rows)} recipe(s). Run again with --apply to write them.")
        return

    backfilled = 0
    failed = 0
    for recipe_id, title in recipe_rows:
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
        description="Backfill step_ingredient_line for existing recipes without touching any other field."
    )
    parser.add_argument("--apply", action="store_true", help="Write the computed step_ingredient_line values to the database")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only backfill this recipe UUID; repeatable")
    parser.add_argument("--force", action="store_true", help="Recompute components that already have step_ingredient_line")
    args = parser.parse_args()
    asyncio.run(main(
        args.apply,
        {uuid.UUID(value) for value in args.recipe_id},
        args.force,
    ))
