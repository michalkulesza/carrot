import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from api.services import r2 as r2_svc

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
spec = importlib.util.spec_from_file_location("reimport_recipes", SCRIPTS / "reimport_recipes.py")
reimport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reimport)

R2 = "https://images.example"
ARCHIVED = f"{R2}/thumbnails/a.jpg"
CDN = "https://scontent.cdninstagram.com/x.jpg?oe=1"


@pytest.fixture(autouse=True)
def r2(monkeypatch):
    monkeypatch.setattr(reimport.settings, "r2_public_url", R2)


def _recipe(thumbnail):
    return SimpleNamespace(
        id=uuid4(), title="Rosca", author_id=None, source_url="https://example.test/r", servings=4,
        total_time_minutes=30, kcal_per_serving=1, protein_per_serving=2, fat_per_serving=3,
        carbs_per_serving=4, issue_codes=["MISSING_INSTRUCTIONS"], thumbnail_url=thumbnail,
        components=[{"name": "Massa", "ingredients": ["1 egg"], "steps": []}],
    )


def _result():
    return SimpleNamespace(source_capture={"render_status": "residential_rendered"})


@pytest.mark.asyncio
async def test_archived_thumbnail_is_kept_and_never_downloaded(monkeypatch) -> None:
    archive = AsyncMock()
    monkeypatch.setattr(reimport, "_archive_thumbnail", archive)
    recipe = _recipe(CDN)

    decision = await reimport._settle_thumbnail(recipe, ARCHIVED, _result(), archive=True)

    assert recipe.thumbnail_url == ARCHIVED
    assert "kept archived" in decision
    archive.assert_not_awaited()


@pytest.mark.asyncio
async def test_remote_thumbnail_is_archived_with_the_worker_helper(monkeypatch) -> None:
    async def fake_archive(recipe, *, residential=False):
        assert residential is True
        recipe.thumbnail_url = ARCHIVED

    archive = AsyncMock(side_effect=fake_archive)
    monkeypatch.setattr(reimport, "_archive_thumbnail", archive)
    recipe = _recipe(CDN)

    decision = await reimport._settle_thumbnail(recipe, "https://old.cdn/x.jpg", _result(), archive=True)

    assert recipe.thumbnail_url == ARCHIVED
    assert decision == "archived new thumbnail"


@pytest.mark.asyncio
async def test_archive_failure_keeps_the_old_value(monkeypatch) -> None:
    monkeypatch.setattr(reimport, "_archive_thumbnail", AsyncMock())  # helper swallows errors, leaves URL remote
    recipe = _recipe(CDN)

    decision = await reimport._settle_thumbnail(recipe, "https://old.cdn/x.jpg", _result(), archive=True)

    assert recipe.thumbnail_url == "https://old.cdn/x.jpg"
    assert "kept previous" in decision


class FakeSession:
    def __init__(self, recipe) -> None:
        self.recipe = recipe
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.merge = AsyncMock()
        self.get = AsyncMock(side_effect=lambda _model, _key: self.recipe)
        self.scalar = AsyncMock(return_value=None)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


@pytest.mark.asyncio
async def test_preview_rolls_back_and_never_calls_r2(monkeypatch) -> None:
    recipe = _recipe(CDN)
    session = FakeSession(recipe)
    archive = AsyncMock()
    r2_upload = Mock()
    monkeypatch.setattr(r2_svc, "upload_image", r2_upload)
    monkeypatch.setattr(reimport, "async_session_maker", lambda: session)
    monkeypatch.setattr(reimport, "_get_tags_and_allergens", AsyncMock(return_value=([], [])))
    monkeypatch.setattr(reimport, "_extract", AsyncMock(return_value=_result()))
    monkeypatch.setattr(reimport, "existing_linked_ids", lambda _components: {})
    monkeypatch.setattr(reimport, "_archive_thumbnail", archive)

    def fake_apply(target, _result, _auto):
        target.title = "Rosca de Laranja"
        target.issue_codes = []
        target.thumbnail_url = "https://scontent.cdninstagram.com/new.jpg"
        target.components = [{"name": "Massa", "ingredients": ["1 egg", "2 cups"], "steps": ["Mix"]}]

    monkeypatch.setattr(reimport, "apply_extraction", fake_apply)

    succeeded, retryable, message = await reimport._reimport_recipe(recipe.id, preview=True)

    assert succeeded and not retryable
    session.rollback.assert_awaited()
    session.commit.assert_not_awaited()
    session.merge.assert_not_awaited()
    archive.assert_not_awaited()
    r2_upload.assert_not_called()
    assert "Rosca -> Rosca de Laranja" in message
    assert "Massa: 2 ingredient line(s), 1 step(s)" in message
    assert "MISSING_INSTRUCTIONS" in message
    assert "would archive" in message


@pytest.mark.asyncio
async def test_main_rejects_apply_with_preview() -> None:
    with pytest.raises(ValueError, match="--preview"):
        await reimport.main(True, None, set(), 1, 0, preview=True)


def test_cli_rejects_apply_with_preview(monkeypatch) -> None:
    import runpy
    import sys

    monkeypatch.setattr(sys, "argv", ["reimport_recipes.py", "--apply", "--preview"])
    with pytest.raises(SystemExit) as exit_info:
        runpy.run_path(str(SCRIPTS / "reimport_recipes.py"), run_name="__main__")
    assert exit_info.value.code == 2
