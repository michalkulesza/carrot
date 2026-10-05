"""Import recipes linked from ingredient lines and resolve their allergens onto the parent."""

import uuid
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import (
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


def normalize_link(url: str | None) -> str | None:
    """Comparable form of an http(s) URL (no fragment or trailing slash, lowercase host), else None."""
    parts = urlsplit((url or "").strip())
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))


def linked_urls(components: list[dict], own_url: str | None = None) -> list[str]:
    """Distinct normalised linked URLs in ingredient order, minus the recipe's own URL, capped."""
    own = normalize_link(own_url)
    urls: list[str] = []
    for component in components:
        for link in component.get("ingredient_links") or []:
            url = normalize_link(link)
            if url and url != own and url not in urls:
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


async def spawn_linked_imports(session: AsyncSession, parent: Recipe, job: ImportJob) -> None:
    """Queue an import per linked recipe (one level deep); reuse recipes the household already has."""
    if job.parent_recipe_id is not None:
        return
    urls = linked_urls(parent.components or [], parent.source_url)
    if not urls:
        return
    existing = await _household_recipes_by_url(session, job.household_id, urls)
    existing = {url: recipe_id for url, recipe_id in existing.items() if recipe_id != parent.id}
    if existing:
        parent.components, _ = set_linked_recipe_ids(parent.components, existing)
        await add_related_recipes(session, parent.id, existing.values())
        await allergen_rechecks.enqueue_recipe_allergen_check(session, parent.id)
    for url in urls:
        if url in existing:
            continue
        child_id = await session.scalar(
            pg_insert(ImportJob).values(
                user_id=job.user_id, household_id=job.household_id, kind=ImportJobKind.URL, input={"url": url},
                parent_recipe_id=parent.id, idempotency_key=_child_idempotency_key(parent.id, url),
                status=ImportJobStatus.PENDING, next_attempt_at=datetime.utcnow(),
            ).on_conflict_do_nothing(index_elements=["user_id", "idempotency_key"]).returning(ImportJob.id)
        )
        if child_id is not None:
            await _event_for_job(session, await session.get(ImportJob, child_id), "import_job.created")


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


async def resolve_linked_allergens(session: AsyncSession, components: list[dict]) -> tuple[list[dict], str]:
    """Fill `linked_allergens` on linked ingredients from their analysed recipes.

    The status is "uncertain" while any link is unresolved (no recipe, deleted, or not analysed).
    """
    ids = {uuid.UUID(recipe_id) for component in components for recipe_id in component.get("linked_recipe_ids") or [] if recipe_id}
    linked = {recipe.id: recipe for recipe in (await session.scalars(select(Recipe).where(Recipe.id.in_(ids)))).all()} if ids else {}
    unresolved = False
    resolved_components = []
    for component in components:
        links = component.get("ingredient_links") or []
        ids_by_index = component.get("linked_recipe_ids") or []
        flags = [dict(flag or {}) for flag in component.get("ingredient_flags") or []]
        flags += [{} for _ in range(len(links) - len(flags))]
        for index, link in enumerate(links):
            if not link:
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
