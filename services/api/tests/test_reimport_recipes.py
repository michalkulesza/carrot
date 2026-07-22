from collections import deque
from uuid import uuid4

from api.services.reimport_scheduler import QueuedRecipe, next_ready_recipe, recipe_domain


def test_recipe_domain_uses_the_hostname() -> None:
    assert recipe_domain("https://www.example.com/recipes/soup") == "www.example.com"


def test_next_ready_recipe_rotates_between_domains() -> None:
    first = QueuedRecipe(recipe_id=uuid4(), domain="a.example")
    second = QueuedRecipe(recipe_id=uuid4(), domain="a.example")
    third = QueuedRecipe(recipe_id=uuid4(), domain="b.example")
    recipes_by_domain = {
        "a.example": deque([first, second]),
        "b.example": deque([third]),
    }
    domain_order = deque(recipes_by_domain)

    assert next_ready_recipe(domain_order, recipes_by_domain, now=0) is first
    assert next_ready_recipe(domain_order, recipes_by_domain, now=0) is third
    assert next_ready_recipe(domain_order, recipes_by_domain, now=0) is second


def test_next_ready_recipe_skips_domains_that_are_cooling_down() -> None:
    delayed = QueuedRecipe(recipe_id=uuid4(), domain="a.example", retry_at=60)
    ready = QueuedRecipe(recipe_id=uuid4(), domain="b.example")
    recipes_by_domain = {
        "a.example": deque([delayed]),
        "b.example": deque([ready]),
    }
    domain_order = deque(recipes_by_domain)

    assert next_ready_recipe(domain_order, recipes_by_domain, now=0) is ready
