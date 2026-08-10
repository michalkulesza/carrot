from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest

from api.models import ImportMetadata, ImportResult, ImportStage, RecipeExtraction
from api.services import import_worker


class FakeResponse:
    content = b"thumbnail-bytes"

    def raise_for_status(self) -> None:
        return None


class FakeClient:
    def __init__(self, get: AsyncMock) -> None:
        self.get = get

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


def _configure_r2(monkeypatch) -> None:
    monkeypatch.setattr(import_worker.settings, "r2_endpoint_url", "https://r2.example")
    monkeypatch.setattr(import_worker.settings, "r2_access_key_id", "access-key")
    monkeypatch.setattr(import_worker.settings, "r2_bucket_name", "thumbnails")
    monkeypatch.setattr(import_worker.settings, "r2_public_url", "https://images.example")


@pytest.mark.asyncio
async def test_archive_thumbnail_copies_external_image_to_r2(monkeypatch) -> None:
    _configure_r2(monkeypatch)
    recipe_id = uuid4()
    recipe = SimpleNamespace(id=recipe_id, thumbnail_url="https://cdn.instagram.com/signed.jpg")
    get = AsyncMock(return_value=FakeResponse())
    client = FakeClient(get)
    upload_image = Mock(return_value=f"https://images.example/thumbnails/{recipe_id}/stable.jpg")
    monkeypatch.setattr(import_worker.httpx, "AsyncClient", lambda **_kwargs: client)
    monkeypatch.setattr(import_worker.r2_svc, "upload_image", upload_image)

    await import_worker._archive_thumbnail(recipe)

    assert recipe.thumbnail_url == f"https://images.example/thumbnails/{recipe_id}/stable.jpg"
    get.assert_awaited_once_with(
        "https://cdn.instagram.com/signed.jpg",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    upload_image.assert_called_once_with(b"thumbnail-bytes", str(recipe_id))


@pytest.mark.asyncio
@pytest.mark.parametrize("thumbnail_url", [None, "https://images.example/thumbnails/stable.jpg"])
async def test_archive_thumbnail_skips_missing_and_r2_images(monkeypatch, thumbnail_url) -> None:
    _configure_r2(monkeypatch)
    recipe = SimpleNamespace(id=uuid4(), thumbnail_url=thumbnail_url)
    create_client = Mock(side_effect=AssertionError("HTTP client should not be created"))
    monkeypatch.setattr(import_worker.httpx, "AsyncClient", create_client)

    await import_worker._archive_thumbnail(recipe)

    assert recipe.thumbnail_url == thumbnail_url
    create_client.assert_not_called()


@pytest.mark.asyncio
async def test_archive_thumbnail_keeps_external_url_when_download_fails(monkeypatch) -> None:
    _configure_r2(monkeypatch)
    thumbnail_url = "https://cdn.instagram.com/expired.jpg"
    recipe = SimpleNamespace(id=uuid4(), thumbnail_url=thumbnail_url)
    get = AsyncMock(side_effect=httpx.HTTPError("download failed"))
    client = FakeClient(get)
    upload_image = Mock()
    monkeypatch.setattr(import_worker.httpx, "AsyncClient", lambda **_kwargs: client)
    monkeypatch.setattr(import_worker.r2_svc, "upload_image", upload_image)

    await import_worker._archive_thumbnail(recipe)

    assert recipe.thumbnail_url == thumbnail_url
    upload_image.assert_not_called()


@pytest.mark.asyncio
async def test_save_recipe_archives_thumbnail_before_returning(monkeypatch) -> None:
    recipe_id = uuid4()
    thumbnail_url = "https://cdn.instagram.com/signed.jpg"
    session = SimpleNamespace(
        add=Mock(side_effect=lambda recipe: setattr(recipe, "id", recipe_id)),
        flush=AsyncMock(),
        get=AsyncMock(return_value=None),
    )
    job = SimpleNamespace(user_id=uuid4(), household_id=uuid4())
    result = ImportResult(
        stage=ImportStage.DESCRIPTION,
        recipe=RecipeExtraction(
            title="Imported recipe",
            kcal_per_serving=100,
            protein_per_serving=10,
            fat_per_serving=5,
            carbs_per_serving=12,
        ),
        metadata=ImportMetadata(thumbnail_url=thumbnail_url),
    )
    archive_thumbnail = AsyncMock()
    link_recipe = AsyncMock()
    queue_embedding = AsyncMock()
    monkeypatch.setattr(import_worker, "_archive_thumbnail", archive_thumbnail)
    monkeypatch.setattr(import_worker, "_link_recipe_to_household", link_recipe)
    monkeypatch.setattr(import_worker, "queue_recipe_embedding", queue_embedding)

    recipe = await import_worker._save_recipe(session, job, result)

    assert recipe.id == recipe_id
    assert recipe.thumbnail_url == thumbnail_url
    archive_thumbnail.assert_awaited_once_with(recipe)
    link_recipe.assert_awaited_once_with(session, recipe_id, job.household_id)
    queue_embedding.assert_awaited_once_with(session, recipe)
