import uuid
from collections import deque
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass
class QueuedRecipe:
    recipe_id: uuid.UUID
    domain: str
    retries: int = 0
    retry_at: float = 0


def recipe_domain(source_url: str) -> str:
    return urlparse(source_url).hostname or source_url


def next_ready_recipe(
    domain_order: deque[str],
    recipes_by_domain: dict[str, deque[QueuedRecipe]],
    now: float,
) -> QueuedRecipe | None:
    for _ in range(len(domain_order)):
        domain = domain_order.popleft()
        recipes = recipes_by_domain[domain]
        if not recipes:
            continue

        domain_order.append(domain)
        recipe = recipes[0]
        if recipe.retry_at <= now:
            return recipes.popleft()
    return None


def next_retry_at(recipes_by_domain: dict[str, deque[QueuedRecipe]]) -> float | None:
    retry_times = [recipe.retry_at for recipes in recipes_by_domain.values() for recipe in recipes]
    return min(retry_times, default=None)
