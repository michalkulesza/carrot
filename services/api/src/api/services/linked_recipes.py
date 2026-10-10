"""Import recipes linked from ingredient lines and resolve their allergens onto the parent."""

import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import (
    ImportFailureCode,
    ImportJob,
    ImportJobKind,
    ImportJobStatus,
    Recipe,
    recipe_households_table,
    recipe_related_recipes_table,
)
from api.routes.imports import _event_for_job
from api.services import allergen_rechecks
from api.services.related_recipes import add_related_recipes

MAX_LINKED_IMPORTS = 5
AWAITING_CHILDREN_TIMEOUT = timedelta(minutes=10)
RECIPE_LINK = "recipe"
EXTERNAL_LINK = "external"
NON_RECIPE_FAILURE_CODES = (ImportFailureCode.NO_RECIPE_CONTENT, ImportFailureCode.UNSUPPORTED_SOURCE)
_RESETTABLE_STATUSES = (ImportJobStatus.FAILED, ImportJobStatus.CANCELLED)
_WAITING_ON_CHILD_STATUSES = (ImportJobStatus.PENDING, ImportJobStatus.RUNNING)


def normalize_link(url: str | None) -> str | None:
    """Comparable form of an http(s) URL (no fragment or trailing slash, lowercase host), else None."""
    parts = urlsplit((url or "").strip())
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))


def _site(url: str | None) -> str:
    host = (urlsplit(url or "").hostname or "").casefold().rstrip(".")
    return host.removeprefix("www.")


def _computed_kind(link: str | None, own_site: str, non_recipe_urls: set[str]) -> str | None:
    url = normalize_link(link)
    if url is None:
        return None
    return RECIPE_LINK if own_site and _site(url) == own_site and url not in non_recipe_urls else EXTERNAL_LINK


def with_link_kinds(components: list[dict], source_url: str | None, non_recipe_urls: Iterable[str] = ()) -> list[dict]:
    """Copy of components with `ingredient_link_kinds` recomputed: same-site links are recipes unless known otherwise."""
    own_site = _site(source_url)
    excluded = set(non_recipe_urls)
    return [
        {**component, "ingredient_link_kinds": [
            _computed_kind(link, own_site, excluded) for link in component.get("ingredient_links") or []
        ]}
        for component in components
    ]


def link_kinds(component: dict, source_url: str | None) -> list[str | None]:
    """Stored kinds per link, computed from `source_url` for legacy components that have none."""
    links = component.get("ingredient_links") or []
    stored = component.get("ingredient_link_kinds") or []
    own_site = _site(source_url)
    return [
        (stored[index] if index < len(stored) and stored[index] else None) or _computed_kind(link, own_site, set())
        if link else None
        for index, link in enumerate(links)
    ]


def external_urls(components: list[dict]) -> set[str]:
    """Normalised URLs stored as external, so a confirmed non-recipe page stays external across rewrites."""
    return {
        url
        for component in components
        for link, kind in zip(component.get("ingredient_links") or [], component.get("ingredient_link_kinds") or [])
        if kind == EXTERNAL_LINK and (url := normalize_link(link))
    }


def preserved_external_urls(stored: dict, links: list[str | None]) -> set[str]:
    """External URLs of `stored` whose line still carries the same link in `links`."""
    stored_links = stored.get("ingredient_links") or []
    stored_kinds = stored.get("ingredient_link_kinds") or []
    return {
        url
        for index, link in enumerate(links)
        if link and index < len(stored_links) and index < len(stored_kinds)
        and stored_links[index] == link and stored_kinds[index] == EXTERNAL_LINK
        and (url := normalize_link(link))
    }


def recipe_link_urls(components: list[dict], source_url: str | None) -> set[str]:
    """Every normalised link that points at a linkable recipe (kind "recipe")."""
    return {
        url
        for component in components
        for link, kind in zip(component.get("ingredient_links") or [], link_kinds(component, source_url))
        if kind == RECIPE_LINK and (url := normalize_link(link))
    }


def linked_urls(components: list[dict], own_url: str | None = None) -> list[str]:
    """Distinct normalised recipe links, minus the recipe's own URL, capped (shop/affiliate links are external)."""
    own = normalize_link(own_url)
    urls: list[str] = []
    for component in components:
        for link, kind in zip(component.get("ingredient_links") or [], link_kinds(component, own_url)):
            url = normalize_link(link)
            if kind == RECIPE_LINK and url and url != own and url not in urls:
                urls.append(url)
    return urls[:MAX_LINKED_IMPORTS]


def set_linked_recipe_ids(components: list[dict], recipe_ids_by_url: dict[str, uuid.UUID]) -> tuple[list[dict], int]:
    """Copy of components with `linked_recipe_ids` filled in for matching links, plus the match count."""
    matched = 0
    updated = []
    for component in components:
        links = component.get("ingredient_links") or []
        ids = list(component.get("linked_recipe_ids") or [])
        ids += [None] * (len(links) - len(ids))
        for index, link in enumerate(links):
            recipe_id = recipe_ids_by_url.get(normalize_link(link) or "")
            if recipe_id is not None:
                ids[index] = str(recipe_id)
                matched += 1
        updated.append({**component, "linked_recipe_ids": ids})
    return updated, matched


def existing_linked_ids(components: list[dict]) -> dict[str, uuid.UUID]:
    """Normalised link URL -> stored linked recipe id, to carry links across a re-extraction."""
    found: dict[str, uuid.UUID] = {}
    for component in components:
        for link, recipe_id in zip(component.get("ingredient_links") or [], component.get("linked_recipe_ids") or []):
            url = normalize_link(link)
            if url and recipe_id:
                found.setdefault(url, uuid.UUID(recipe_id))
    return found


async def linking_household_id(session: AsyncSession, recipe_id: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(
        select(recipe_households_table.c.household_id)
        .where(recipe_households_table.c.recipe_id == recipe_id)
        .order_by(recipe_households_table.c.household_id)
        .limit(1)
    )


async def is_component_recipe(session: AsyncSession, recipe: Recipe) -> bool:
    """True when the recipe is itself linked from another recipe, so it must not spawn its own children."""
    imported_as_child = await session.scalar(
        select(exists().where(ImportJob.result_recipe_id == recipe.id, ImportJob.parent_recipe_id.is_not(None)))
    )
    if imported_as_child:
        return True
    own_url = normalize_link(recipe.source_url)
    if own_url is None:
        return False
    host = urlsplit(own_url).hostname
    households = select(recipe_households_table.c.household_id).where(recipe_households_table.c.recipe_id == recipe.id)
    candidates = (await session.scalars(
        select(Recipe)
        .join(recipe_households_table, recipe_households_table.c.recipe_id == Recipe.id)
        .where(
            recipe_households_table.c.household_id.in_(households),
            Recipe.id != recipe.id,
            cast(Recipe.components, Text).ilike(f"%{host}%"),
        )
    )).unique().all()
    return any(
        normalize_link(link) == own_url
        for candidate in candidates
        for component in candidate.components or []
        for link in component.get("ingredient_links") or []
    )


async def _household_recipes_by_url(session: AsyncSession, household_id: uuid.UUID, urls: list[str]) -> dict[str, uuid.UUID]:
    hosts = {urlsplit(url).hostname for url in urls}
    rows = (await session.execute(
        select(Recipe.id, Recipe.source_url)
        .join(recipe_households_table, recipe_households_table.c.recipe_id == Recipe.id)
        .where(
            recipe_households_table.c.household_id == household_id,
            or_(*(Recipe.source_url.ilike(f"%{host}%") for host in hosts)),
        )
        .order_by(Recipe.created_at)
    )).all()
    found: dict[str, uuid.UUID] = {}
    for recipe_id, source_url in rows:
        found.setdefault(normalize_link(source_url) or "", recipe_id)
    return {url: found[url] for url in urls if url in found}


def _child_idempotency_key(parent_id: uuid.UUID, url: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"{parent_id}:{url}")


async def _insert_child_job(
    session: AsyncSession, parent_id: uuid.UUID, user_id: uuid.UUID, household_id: uuid.UUID, url: str,
    *, requested_by_user: bool = False,
) -> uuid.UUID | None:
    job_input = {"url": url, "requested_by_user": True} if requested_by_user else {"url": url}
    child_id = await session.scalar(
        pg_insert(ImportJob).values(
            user_id=user_id, household_id=household_id, kind=ImportJobKind.URL, input=job_input,
            parent_recipe_id=parent_id, idempotency_key=_child_idempotency_key(parent_id, url),
            status=ImportJobStatus.PENDING, next_attempt_at=datetime.utcnow(),
        ).on_conflict_do_nothing(index_elements=["user_id", "idempotency_key"]).returning(ImportJob.id)
    )
    if child_id is not None:
        await _event_for_job(session, await session.get(ImportJob, child_id), "import_job.created")
    return child_id


async def spawn_linked_imports(
    session: AsyncSession, parent: Recipe, *, user_id: uuid.UUID, household_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Queue an import per unresolved linked recipe; reuse recipes the household already has. Returns new job ids."""
    resolved = existing_linked_ids(parent.components or [])
    urls = [url for url in linked_urls(parent.components or [], parent.source_url) if url not in resolved]
    if not urls:
        return []
    existing = await _household_recipes_by_url(session, household_id, urls)
    existing = {url: recipe_id for url, recipe_id in existing.items() if recipe_id != parent.id}
    if existing:
        await attach_existing_recipes(session, parent, existing)
    child_ids: list[uuid.UUID] = []
    for url in urls:
        if url in existing:
            continue
        child_id = await _insert_child_job(session, parent.id, user_id, household_id, url)
        if child_id is not None:
            child_ids.append(child_id)
    return child_ids


async def attach_existing_recipes(session: AsyncSession, parent: Recipe, recipe_ids_by_url: dict[str, uuid.UUID]) -> None:
    parent.components, _ = set_linked_recipe_ids(parent.components or [], recipe_ids_by_url)
    await add_related_recipes(session, parent.id, recipe_ids_by_url.values())
    await allergen_rechecks.enqueue_recipe_allergen_check(session, parent.id)


async def import_linked_recipe(
    session: AsyncSession, parent: Recipe, *, user_id: uuid.UUID, household_id: uuid.UUID, url: str,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """On-demand import of one linked URL. Returns (recipe_id, job_id); `url` must already be normalised."""
    existing = (await _household_recipes_by_url(session, household_id, [url])).get(url)
    if existing is not None and existing != parent.id:
        await attach_existing_recipes(session, parent, {url: existing})
        return existing, None

    child_id = await _insert_child_job(session, parent.id, user_id, household_id, url, requested_by_user=True)
    if child_id is not None:
        return None, child_id

    job = await session.scalar(
        select(ImportJob)
        .where(ImportJob.user_id == user_id, ImportJob.idempotency_key == _child_idempotency_key(parent.id, url))
        .with_for_update()
    )
    if job.status in _RESETTABLE_STATUSES:
        job.status = ImportJobStatus.PENDING
        job.input = {"url": url, "requested_by_user": True}
        job.failure_code = None
        job.failure_stage = None
        job.diagnostic_error = None
        job.outcome = None
        job.retry_count = 0
        job.started_at = None
        job.dismissed_at = None
        job.next_attempt_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        await _event_for_job(session, job, "import_job.created")
    elif job.status == ImportJobStatus.SUCCEEDED and job.result_recipe_id is not None:
        child = await session.get(Recipe, job.result_recipe_id)
        if child is not None:
            await attach_existing_recipes(session, parent, {url: child.id})
            return child.id, job.id
    return None, job.id


async def finalize_parent_if_ready(
    session: AsyncSession, parent_job_id: uuid.UUID, *, force: bool = False, event_type: str = "import_job.succeeded",
) -> bool:
    """Mark a parent import done once all its child jobs are terminal (or unconditionally with `force`)."""
    parent_job = await session.scalar(select(ImportJob).where(ImportJob.id == parent_job_id).with_for_update())
    if parent_job is None or parent_job.status != ImportJobStatus.AWAITING_CHILDREN:
        return False
    if not force:
        waiting = await session.scalar(
            select(func.count()).select_from(ImportJob).where(
                ImportJob.parent_recipe_id == parent_job.result_recipe_id,
                ImportJob.user_id == parent_job.user_id,
                ImportJob.status.in_(_WAITING_ON_CHILD_STATUSES),
            )
        )
        if waiting:
            return False
    parent_job.status = ImportJobStatus.SUCCEEDED
    parent_job.updated_at = datetime.utcnow()
    await _event_for_job(session, parent_job, event_type)
    return True


async def finalize_parent_of_child(session: AsyncSession, child: ImportJob) -> bool:
    if child.parent_recipe_id is None:
        return False
    parent_job_id = await session.scalar(
        select(ImportJob.id).where(
            ImportJob.result_recipe_id == child.parent_recipe_id,
            ImportJob.user_id == child.user_id,
            ImportJob.status == ImportJobStatus.AWAITING_CHILDREN,
        )
    )
    if parent_job_id is None:
        return False
    return await finalize_parent_if_ready(session, parent_job_id)


async def cancel_awaiting_parent(session: AsyncSession, parent_job: ImportJob) -> None:
    """Cancelling a waiting import keeps the saved recipe, drops its unfinished children and finishes the job."""
    children = (await session.scalars(
        select(ImportJob).where(
            ImportJob.parent_recipe_id == parent_job.result_recipe_id,
            ImportJob.user_id == parent_job.user_id,
            ImportJob.status.in_(_WAITING_ON_CHILD_STATUSES),
        ).with_for_update()
    )).all()
    for child in children:
        child.status = ImportJobStatus.CANCELLED
        child.next_attempt_at = None
        child.updated_at = datetime.utcnow()
        await _event_for_job(session, child, "import_job.cancelled")
    await finalize_parent_if_ready(session, parent_job.id, force=True, event_type="import_job.cancelled")


async def finalize_overdue_parents(session: AsyncSession, now: datetime | None = None) -> int:
    """Safety net so a parent can never stay busy when its children are stuck or lost."""
    cutoff = (now or datetime.utcnow()) - AWAITING_CHILDREN_TIMEOUT
    overdue = (await session.scalars(
        select(ImportJob.id).where(ImportJob.status == ImportJobStatus.AWAITING_CHILDREN, ImportJob.updated_at < cutoff)
    )).all()
    finalized = 0
    for parent_job_id in overdue:
        finalized += await finalize_parent_if_ready(session, parent_job_id, force=True)
    return finalized


async def attach_child_to_parent(session: AsyncSession, parent_id: uuid.UUID, child: Recipe, url: str | None) -> None:
    """Point the parent's matching linked ingredients at the imported child and refresh its allergens."""
    child_url = normalize_link(url)
    parent = await session.get(Recipe, parent_id, with_for_update=True)
    if parent is None or child_url is None or parent.id == child.id:
        return
    components, matched = set_linked_recipe_ids(parent.components or [], {child_url: child.id})
    if not matched:
        return
    parent.components = components
    await add_related_recipes(session, parent.id, [child.id])
    await allergen_rechecks.enqueue_recipe_allergen_check(session, parent.id)


async def mark_link_external(session: AsyncSession, parent_id: uuid.UUID, url: str | None) -> None:
    """Flag the parent's links to a page that turned out not to be a recipe as external and refresh its allergens."""
    target = normalize_link(url)
    parent = await session.get(Recipe, parent_id, with_for_update=True)
    if parent is None or target is None:
        return
    changed = False
    components = []
    for component in parent.components or []:
        kinds = link_kinds(component, parent.source_url)
        for index, link in enumerate(component.get("ingredient_links") or []):
            if normalize_link(link) == target and kinds[index] != EXTERNAL_LINK:
                kinds[index] = EXTERNAL_LINK
                changed = True
        components.append({**component, "ingredient_link_kinds": kinds})
    if not changed:
        return
    parent.components = components
    await allergen_rechecks.enqueue_recipe_allergen_check(session, parent.id)


def recipe_allergens(components: list[dict]) -> list[str]:
    """Sorted allergens per line: a resolved linked recipe's allergens replace the line's own flag."""
    found: set[str] = set()
    for component in components:
        for flag in component.get("ingredient_flags") or []:
            if not flag or flag.get("substitute_applied"):
                continue
            linked = flag.get("linked_allergens")
            found.update(filter(None, linked if linked is not None else [flag.get("allergen")]))
    return sorted(found)


async def resolve_linked_allergens(
    session: AsyncSession, components: list[dict], source_url: str | None = None,
) -> tuple[list[dict], str]:
    """Fill `linked_allergens` on linked recipe ingredients from their analysed recipes.

    The status is "uncertain" while any recipe link is unresolved (no recipe, deleted, or not analysed).
    External links are ordinary ingredients.
    """
    ids = {uuid.UUID(recipe_id) for component in components for recipe_id in component.get("linked_recipe_ids") or [] if recipe_id}
    linked = {recipe.id: recipe for recipe in (await session.scalars(select(Recipe).where(Recipe.id.in_(ids)))).all()} if ids else {}
    unresolved = False
    resolved_components = []
    for component in components:
        links = component.get("ingredient_links") or []
        kinds = link_kinds(component, source_url)
        ids_by_index = component.get("linked_recipe_ids") or []
        flags = [dict(flag or {}) for flag in component.get("ingredient_flags") or []]
        flags += [{} for _ in range(len(links) - len(flags))]
        for index, link in enumerate(links):
            if not link:
                continue
            if kinds[index] == EXTERNAL_LINK:
                flags[index]["linked_allergens"] = None
                continue
            recipe_id = ids_by_index[index] if index < len(ids_by_index) else None
            recipe = linked.get(uuid.UUID(recipe_id)) if recipe_id else None
            if recipe is not None and recipe.allergen_status == "analyzed":
                flags[index]["linked_allergens"] = recipe_allergens(recipe.components or [])
            else:
                flags[index]["linked_allergens"] = None
                unresolved = True
        resolved_components.append({**component, "ingredient_flags": flags})
    return resolved_components, "uncertain" if unresolved else "analyzed"


async def parent_recipe_ids(session: AsyncSession, recipe_id: uuid.UUID) -> list[uuid.UUID]:
    """Related recipes whose components link to `recipe_id`."""
    table = recipe_related_recipes_table
    related = select(table.c.related_recipe_id).where(table.c.recipe_id == recipe_id).union(
        select(table.c.recipe_id).where(table.c.related_recipe_id == recipe_id)
    )
    candidates = (await session.scalars(select(Recipe).where(Recipe.id.in_(related)))).all()
    target = str(recipe_id)
    return [
        recipe.id for recipe in candidates
        if any(target in (component.get("linked_recipe_ids") or []) for component in recipe.components or [])
    ]
