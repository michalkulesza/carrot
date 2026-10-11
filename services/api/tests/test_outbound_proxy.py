from types import SimpleNamespace

import pytest

from api.config import settings
from api.routes import proxy
from api.services import import_worker
from api.services.extraction_v2 import production, sources
from api.services.html_renderer import RendererFailure

PROXY_URL = "socks5://warp:1080"


class ClientCreated(Exception):
    pass


class FakeStream:
    headers = {"content-type": "image/png"}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_bytes(self, _size):
        yield b"data"


class FakeImageClient:
    def __init__(self, created: list[dict], kwargs: dict) -> None:
        created.append(kwargs)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def head(self, *_args, **_kwargs):
        return FakeStream()

    def stream(self, *_args, **_kwargs):
        return FakeStream()


def _capture_creation(monkeypatch, module) -> list[dict]:
    created: list[dict] = []

    def factory(**kwargs):
        created.append(kwargs)
        raise ClientCreated

    monkeypatch.setattr(module.httpx, "AsyncClient", factory)
    return created


async def _fetch_html() -> None:
    await production._fetch_html("https://recipes.example/page")


async def _fetch_linked_page(monkeypatch) -> None:
    async def render(_url):
        raise RendererFailure("timeout", operational=True)

    monkeypatch.setattr(sources, "render_url", render)

    await sources.HttpLinkedPageProvider().fetch("https://recipes.example/page")


async def _archive_thumbnail(monkeypatch) -> None:
    monkeypatch.setattr(import_worker.settings, "r2_endpoint_url", "https://r2.example")
    monkeypatch.setattr(import_worker.settings, "r2_access_key_id", "access-key")
    monkeypatch.setattr(import_worker.settings, "r2_bucket_name", "thumbnails")
    monkeypatch.setattr(import_worker.settings, "r2_public_url", "https://images.example")
    recipe = SimpleNamespace(id="recipe", thumbnail_url="https://cdn.example/a.jpg")

    await import_worker._archive_thumbnail(recipe)


async def _proxy_image(monkeypatch) -> list[dict]:
    created: list[dict] = []
    monkeypatch.setattr(proxy.httpx, "AsyncClient", lambda **kwargs: FakeImageClient(created, kwargs))
    response = await proxy.proxy_image("https://images.example/a.png")
    async for _chunk in response.body_iterator:
        pass
    return created


@pytest.mark.asyncio
@pytest.mark.parametrize("configured,expected", [(PROXY_URL, PROXY_URL), ("", None)])
@pytest.mark.parametrize("site", ["production_fetch_html", "linked_page", "archive_thumbnail"])
async def test_single_client_sites_pass_configured_proxy(monkeypatch, site, configured, expected) -> None:
    monkeypatch.setattr(settings, "outbound_proxy_url", configured)
    module = {"production_fetch_html": production, "linked_page": sources, "archive_thumbnail": import_worker}[site]
    created = _capture_creation(monkeypatch, module)

    if site == "production_fetch_html":
        with pytest.raises(ClientCreated):
            await _fetch_html()
    elif site == "linked_page":
        with pytest.raises(ClientCreated):
            await _fetch_linked_page(monkeypatch)
    else:
        await _archive_thumbnail(monkeypatch)

    assert [kwargs["proxy"] for kwargs in created] == [expected]


@pytest.mark.asyncio
@pytest.mark.parametrize("configured,expected", [(PROXY_URL, PROXY_URL), ("", None)])
async def test_proxy_image_clients_pass_configured_proxy(monkeypatch, configured, expected) -> None:
    monkeypatch.setattr(settings, "outbound_proxy_url", configured)
    created = await _proxy_image(monkeypatch)

    assert [kwargs["proxy"] for kwargs in created] == [expected, expected]
