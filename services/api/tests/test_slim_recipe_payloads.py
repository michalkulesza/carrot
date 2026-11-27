import asyncio
import copy
import json
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from api import main
from api.models import MealPlanEntryOut, PublicRecipeOut, RecipeOut, RecipeSaveRequest, SaveComponent
from api.routes import recipes
from api.routes.recipes import update_recipe
from api.services.recipe_payloads import COMPONENT_EVIDENCE_FIELDS

FIXTURE = json.loads((Path(main.__file__).parent / "showcase_fixture.json").read_text())


def _stored_recipe(fixture: dict) -> SimpleNamespace:
    return SimpleNamespace(
        **{key: copy.deepcopy(value) for key, value in fixture.items() if key not in {"fixture_id", "tag_names"}},
        id=uuid.uuid4(),
        edit_version=1,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
        tags=[],
        author_id=None,
    )


def _evidence_keys(payload: object) -> set[str]:
    if isinstance(payload, dict):
        own = {key for key, value in payload.items() if key.endswith("_evidence") and value}
        return own.union(*(_evidence_keys(value) for value in payload.values()))
    if isinstance(payload, list):
        return set().union(*(_evidence_keys(value) for value in payload))
    return set()


@pytest.mark.parametrize("fixture", FIXTURE["recipes"], ids=lambda fixture: fixture["fixture_id"])
def test_recipe_response_drops_evidence_but_keeps_field_names_and_statuses(fixture) -> None:
    payload = RecipeOut.model_validate(_stored_recipe(fixture)).model_dump(mode="json")

    assert _evidence_keys(payload) == set()
    assert payload["title_evidence"] == []
    for component, stored in zip(payload["components"], fixture["components"]):
        assert {field: component[field] for field in COMPONENT_EVIDENCE_FIELDS} == {field: [] for field in COMPONENT_EVIDENCE_FIELDS}
        assert component["metric_ingredients"] == stored["metric_ingredients"]
        assert component["imperial_ingredients"] == stored["imperial_ingredients"]
    assert payload["nutrition_provenance"] == {
        field: {"status": value["status"]} for field, value in fixture["nutrition_provenance"].items()
    }
    assert payload["total_time_provenance"] == {"status": fixture["total_time_provenance"]["status"]}


def test_showcase_list_payload_shrinks_substantially() -> None:
    stored = [_stored_recipe(fixture) for fixture in FIXTURE["recipes"]]
    full_size = len(json.dumps([
        {**RecipeOut.model_validate(recipe).model_dump(mode="json"),
         "title_evidence": recipe.title_evidence, "components": recipe.components,
         "nutrition_provenance": recipe.nutrition_provenance, "total_time_provenance": recipe.total_time_provenance}
        for recipe in stored
    ]))
    slim_size = len(json.dumps([RecipeOut.model_validate(recipe).model_dump(mode="json") for recipe in stored]))

    assert slim_size < full_size * 0.4
    assert slim_size < 60_000


def test_meal_plan_entries_embed_the_slim_recipe() -> None:
    recipe = _stored_recipe(FIXTURE["recipes"][0])
    entry = SimpleNamespace(id=uuid.uuid4(), date=datetime(2026, 1, 1).date(), recipe=recipe, text=None)

    payload = MealPlanEntryOut.model_validate(entry).model_dump(mode="json")

    assert _evidence_keys(payload) == set()
    assert payload["recipe"]["title_evidence"] == []


def test_public_recipe_is_slim() -> None:
    fixture = FIXTURE["recipes"][0]

    payload = PublicRecipeOut(
        title=fixture["title"], servings=fixture["servings"], kcal_per_serving=fixture["kcal_per_serving"],
        thumbnail_url=None, source_url=fixture["source_url"], components=fixture["components"],
        nutrition_provenance=fixture["nutrition_provenance"], total_time_provenance=fixture["total_time_provenance"],
    ).model_dump(mode="json")

    assert _evidence_keys(payload) == set()
    assert all(set(value) == {"status"} for value in payload["nutrition_provenance"].values())
    assert set(payload["total_time_provenance"]) == {"status"}


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, recipe):
        self.recipe = recipe

    async def execute(self, _statement):
        return FakeResult(self.recipe)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, _recipe):
        pass


@pytest.fixture
def patched_update(monkeypatch):
    async def noop(*_args, **_kwargs):
        pass

    async def empty_map(*_args):
        return {}

    monkeypatch.setattr(recipes, "_set_tags", noop)
    monkeypatch.setattr(recipes, "enqueue_recipe_allergen_check", noop)
    monkeypatch.setattr(recipes, "queue_recipe_embedding", noop)
    monkeypatch.setattr(recipes, "sanitize_recipe", lambda _recipe: None)
    monkeypatch.setattr(recipes.broadcaster, "publish", noop)
    monkeypatch.setattr(recipes, "_get_household_ids_map", empty_map)
    monkeypatch.setattr(recipes, "_build_recipe_out", lambda recipe, **_kwargs: recipe)


def _save_request_from(payload: dict, components: list[dict]) -> RecipeSaveRequest:
    return RecipeSaveRequest(
        **{field: payload[field] for field in (
            "title", "servings", "total_time_minutes", "kcal_per_serving", "protein_per_serving",
            "fat_per_serving", "carbs_per_serving", "thumbnail_url", "creator_handle", "source_url", "notes",
        )},
        components=[SaveComponent.model_validate(component) for component in components],
        expected_edit_version=payload["edit_version"],
    )


async def _save(recipe: SimpleNamespace, body: RecipeSaveRequest) -> None:
    user = SimpleNamespace(id=uuid.uuid4(), nickname="cook", email="cook@example.com")
    await update_recipe(recipe.id, body, None, user, FakeSession(recipe), uuid.uuid4())


@pytest.mark.asyncio
async def test_unchanged_save_from_slim_payload_keeps_all_stored_evidence(patched_update) -> None:
    fixture = FIXTURE["recipes"][0]
    recipe = _stored_recipe(fixture)
    payload = RecipeOut.model_validate(recipe).model_dump(mode="json")

    await _save(recipe, _save_request_from(payload, payload["components"]))

    for saved, original in zip(recipe.components, fixture["components"]):
        for field in COMPONENT_EVIDENCE_FIELDS:
            assert saved[field] == original[field]
    assert recipe.title_evidence == fixture["title_evidence"]
    assert recipe.nutrition_provenance == fixture["nutrition_provenance"]
    assert recipe.total_time_provenance == fixture["total_time_provenance"]


@pytest.mark.asyncio
async def test_edited_save_from_slim_payload_keeps_evidence_for_surviving_lines(patched_update) -> None:
    fixture = FIXTURE["recipes"][0]
    stored = fixture["components"][0]
    recipe = _stored_recipe(fixture)
    payload = RecipeOut.model_validate(recipe).model_dump(mode="json")
    component = copy.deepcopy(payload["components"][0])
    ingredients = component["ingredients"]
    component["ingredients"] = [ingredients[1], ingredients[0], *ingredients[2:], "1 pinch salt"]
    component["shopping_list_categories"] = [*component["shopping_list_categories"], "other"]
    component["steps"] = [f"{component['steps'][0]} Carefully.", *component["steps"][1:]]
    component["name"] = "Renamed"

    await _save(recipe, _save_request_from(payload, [component, *payload["components"][1:]]))

    saved = recipe.components[0]
    evidence = stored["ingredient_evidence"]
    assert saved["ingredient_evidence"] == [evidence[1], evidence[0], *evidence[2:], {"references": [], "links": []}]
    assert saved["step_evidence"] == stored["step_evidence"]
    assert saved["name_evidence"] == stored["name_evidence"]
    assert recipe.title_evidence == fixture["title_evidence"]
    assert recipe.total_time_provenance == fixture["total_time_provenance"]
    assert recipe.nutrition_provenance == fixture["nutrition_provenance"]


def _gzip_kwargs() -> dict:
    return next(middleware for middleware in main.app.user_middleware if middleware.cls is GZipMiddleware).kwargs


async def _run(app, path: str) -> list[dict]:
    messages: list[dict] = []
    scope = {
        "type": "http", "method": "GET", "path": path, "raw_path": path.encode(), "query_string": b"",
        "headers": [(b"accept-encoding", b"gzip")], "http_version": "1.1", "scheme": "http",
        "server": ("test", 80), "client": ("test", 1), "root_path": "",
    }

    requests = [{"type": "http.request", "body": b"", "more_body": False}]

    async def receive():
        if requests:
            return requests.pop()
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    await GZipMiddleware(app, **_gzip_kwargs())(scope, receive, send)
    return messages


@pytest.mark.asyncio
async def test_event_streams_are_not_gzipped_or_buffered() -> None:
    frames = [f"data: {json.dumps({'n': index, 'pad': 'x' * 800})}\n\n".encode() for index in range(3)]

    async def app(scope, receive, send):
        async def stream():
            for frame in frames:
                yield frame

        await StreamingResponse(stream(), media_type="text/event-stream")(scope, receive, send)

    messages = await _run(app, "/api/meal-plan/stream")

    headers = dict(messages[0]["headers"])
    assert b"content-encoding" not in headers
    assert [message["body"] for message in messages[1:] if message.get("body")] == frames


@pytest.mark.asyncio
async def test_large_json_responses_are_gzipped() -> None:
    async def app(scope, receive, send):
        await JSONResponse([{"title": "x" * 2000}])(scope, receive, send)

    messages = await _run(app, "/api/recipes")

    assert dict(messages[0]["headers"])[b"content-encoding"] == b"gzip"
