import argparse
import asyncio
import uuid
from collections import defaultdict, deque
from time import monotonic

from sqlalchemy import select

from api.database import async_session_maker
from api.models import (
    ImportResult,
    Recipe,
    RecipeSourceEvidence,
    UserPreferences,
    recipe_households_table,
)
from api.services import allergen_rechecks
from api.services.import_worker import _get_tags_and_allergens
from api.services.linked_recipes import (
    existing_linked_ids,
    is_component_recipe,
    linking_household_id,
    set_linked_recipe_ids,
    spawn_linked_imports,
)
from api.services.recipe_reextraction import apply_extraction
from api.services.monitoring import init_sentry
from api.services import gemini
from api.services.extraction_v2.contracts import FailedOutcome, FailureReason
from api.services.extraction_v2.production import acquire_and_extract_url
from api.services.reimport_scheduler import QueuedRecipe, next_ready_recipe, next_retry_at, recipe_domain


class ReimportFailure(Exception):
    def __init__(self, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


async def _extract(url: str, available_tags: list[str], allergens: list[str]) -> ImportResult:
    usage = gemini.UsageTracker()
    outcome, metadata, source_capture = await acquire_and_extract_url(url, usage)
    if isinstance(outcome, FailedOutcome):
        retryable = outcome.reason in {
            FailureReason.SOURCE_FETCH_FAILED, FailureReason.TRANSCRIPTION_FAILED,
            FailureReason.MODEL_TIMEOUT, FailureReason.MODEL_RATE_LIMITED,
            FailureReason.UNKNOWN_ERROR,
        }
        raise ReimportFailure(outcome.reason.value.lower(), retryable=retryable)
    extraction = await gemini.enrich_v2_recipe(outcome.recipe, available_tags, allergens or None, usage)
    return ImportResult(
        stage="transcript", recipe=extraction, metadata=metadata, outcome=outcome.outcome,
        issue_codes=[issue.value for issue in outcome.issue_codes],
        evidence=[item.model_dump(mode="json") for item in outcome.evidence],
        trace=[item.model_dump(mode="json") for item in outcome.trace], source_capture=source_capture,
    )


async def _restore_links_and_spawn(session, recipe: Recipe, previous_links: dict[str, uuid.UUID]) -> None:
    surviving_ids = set(await session.scalars(select(Recipe.id).where(Recipe.id.in_(set(previous_links.values())))))
    surviving_links = {url: recipe_id for url, recipe_id in previous_links.items() if recipe_id in surviving_ids}
    recipe.components, _ = set_linked_recipe_ids(recipe.components, surviving_links)

    has_links = any(component.get("ingredient_links") for component in recipe.components)
    if not has_links:
        return
    if await is_component_recipe(session, recipe):
        return

    household_id = await linking_household_id(session, recipe.id)
    if recipe.author_id is None:
        print(f"Not spawning linked imports for {recipe.id}: missing author")
        return

    await spawn_linked_imports(session, recipe, user_id=recipe.author_id, household_id=household_id)
    await allergen_rechecks.enqueue_recipe_allergen_check(session, recipe.id)


async def _reimport_recipe(recipe_id: uuid.UUID) -> tuple[bool, bool, str]:
    async with async_session_maker() as session:
        recipe = await session.get(Recipe, recipe_id)
        if recipe is None:
            return False, False, f"Skipped {recipe_id}: recipe no longer exists"

        recipe_title = recipe.title
        source_url = recipe.source_url
        try:
            household_id = await session.scalar(
                select(recipe_households_table.c.household_id)
                .where(recipe_households_table.c.recipe_id == recipe.id)
                .order_by(recipe_households_table.c.added_at)
                .limit(1)
            )
            available_tags, allergens = await _get_tags_and_allergens(
                session,
                recipe.author_id,
                household_id,
            )
            result = await _extract(source_url, available_tags, allergens)
            preferences = await session.get(UserPreferences, recipe.author_id) if recipe.author_id else None
            previous_links = existing_linked_ids(recipe.components or [])
            apply_extraction(recipe, result, bool(preferences and preferences.auto_substitute))
            await _restore_links_and_spawn(session, recipe, previous_links)
            await allergen_rechecks.settle_allergen_status(session, recipe)
            await session.merge(RecipeSourceEvidence(
                recipe_id=recipe.id, schema_version=1, evidence=result.evidence[:12],
                trace=result.trace[:200], capture=result.source_capture,
            ))
            await session.commit()
            return True, False, f"Re-imported {recipe_id}: {recipe.title}"
        except ReimportFailure as exc:
            await session.rollback()
            return False, exc.retryable, f"Skipped {recipe_id}: {recipe_title} ({source_url}; {exc})"
        except Exception as exc:
            await session.rollback()
            return False, False, f"Skipped {recipe_id}: {recipe_title} ({source_url}; {exc})"


async def main(
    apply: bool,
    limit: int | None,
    recipe_ids: set[uuid.UUID],
    retry_delay_seconds: int,
    max_retries: int,
) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id, Recipe.source_url).where(Recipe.source_url.is_not(None), Recipe.source_url != "")
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        if limit is not None:
            statement = statement.limit(limit)
        recipe_rows = list((await session.execute(statement.order_by(Recipe.created_at))).all())

    if not apply:
        print(f"Would re-import {len(recipe_rows)} URL-backed recipe(s). Run again with --apply to update them.")
        return

    recipes_by_domain: dict[str, deque[QueuedRecipe]] = defaultdict(deque)
    domain_order: deque[str] = deque()
    for recipe_id, source_url in recipe_rows:
        domain = recipe_domain(source_url)
        if not recipes_by_domain[domain]:
            domain_order.append(domain)
        recipes_by_domain[domain].append(QueuedRecipe(recipe_id=recipe_id, domain=domain))

    refreshed = 0
    failed = 0
    while any(recipes_by_domain.values()):
        now = monotonic()
        queued_recipe = next_ready_recipe(domain_order, recipes_by_domain, now)
        if queued_recipe is None:
            retry_at = next_retry_at(recipes_by_domain)
            if retry_at is None:
                break
            delay = max(0, retry_at - now)
            print(f"All remaining recipes are cooling down; waiting {delay:.0f} seconds before retrying.")
            await asyncio.sleep(delay)
            continue

        succeeded, retryable, message = await _reimport_recipe(queued_recipe.recipe_id)
        print(message)
        if succeeded:
            refreshed += 1
        elif retryable and queued_recipe.retries < max_retries:
            queued_recipe.retries += 1
            queued_recipe.retry_at = monotonic() + retry_delay_seconds
            recipes_by_domain[queued_recipe.domain].append(queued_recipe)
            print(
                f"Deferring {queued_recipe.recipe_id} after a transient source failure "
                f"(retry {queued_recipe.retries}/{max_retries})."
            )
        else:
            failed += 1

    print(f"Finished: {refreshed} re-imported, {failed} skipped.")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(
        description="Re-import URL-backed recipes in place using the current extraction model and prompt."
    )
    parser.add_argument("--apply", action="store_true", help="Write refreshed extraction results to the database")
    parser.add_argument("--limit", type=int, help="Process at most this many recipes")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only re-import this recipe UUID; repeatable")
    parser.add_argument("--retry-delay-seconds", type=int, default=60, help="Cooldown before retrying a rate-limited source (default: 60)")
    parser.add_argument("--max-retries", type=int, default=3, help="Retries for a transient source failure (default: 3)")
    args = parser.parse_args()
    if args.retry_delay_seconds < 1:
        parser.error("--retry-delay-seconds must be at least 1")
    if args.max_retries < 0:
        parser.error("--max-retries must be at least 0")
    asyncio.run(main(
        args.apply,
        args.limit,
        {uuid.UUID(value) for value in args.recipe_id},
        args.retry_delay_seconds,
        args.max_retries,
    ))
