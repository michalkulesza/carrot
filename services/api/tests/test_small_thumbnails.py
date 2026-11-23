import io
import sys
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image

from api.config import settings
from api.routes import proxy
from api.services import r2
from api.services.image_fetch import ImageProbe

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import backfill_small_thumbnails  # noqa: E402

URL = "https://cdn.example/photo.jpg"


def _jpeg(width: int, height: int = 100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "red").save(buf, format="JPEG")
    return buf.getvalue()


def _size(data: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(data)).size


@pytest.fixture
def s3(monkeypatch):
    client = Mock()
    monkeypatch.setattr(r2, "_s3_client", lambda: client)
    monkeypatch.setattr(settings, "r2_bucket_name", "bucket")
    monkeypatch.setattr(settings, "r2_public_url", "https://images.example")
    return client


def test_upload_image_writes_full_and_small_variants(s3) -> None:
    url = r2.upload_image(_jpeg(2000, 1000), "recipe-1")

    calls = {c.kwargs["Key"]: c.kwargs for c in s3.put_object.call_args_list}
    key = url.removeprefix("https://images.example/")
    assert set(calls) == {key, key.replace(".jpg", "_sm.jpg")}
    assert _size(calls[key]["Body"]) == (1200, 600)
    small = calls[key.replace(".jpg", "_sm.jpg")]
    assert _size(small["Body"]) == (400, 200)
    assert small["ContentType"] == "image/jpeg"


def test_upload_image_never_upscales(s3) -> None:
    r2.upload_image(_jpeg(300, 150), "recipe-1")

    sizes = {_size(c.kwargs["Body"]) for c in s3.put_object.call_args_list}
    assert sizes == {(300, 150)}


def test_delete_image_removes_small_variant_even_if_missing(s3) -> None:
    s3.delete_object.side_effect = [None, Exception("NoSuchKey")]

    r2.delete_image("https://images.example/thumbnails/r/a.jpg")

    keys = [c.kwargs["Key"] for c in s3.delete_object.call_args_list]
    assert keys == ["thumbnails/r/a.jpg", "thumbnails/r/a_sm.jpg"]


@pytest.fixture
def source(monkeypatch):
    state = {"body": _jpeg(1000, 500), "stream_fetches": 0}

    async def probe(_url):
        return ImageProbe(proxy="", content_type="image/jpeg")

    def handler(_request):
        state["stream_fetches"] += 1
        return httpx.Response(200, content=state["body"], headers={"content-type": "image/jpeg"})

    real = httpx.AsyncClient
    monkeypatch.setattr(proxy, "probe_image", probe)
    monkeypatch.setattr(proxy.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **{**kw, "proxy": None}))
    return state


@pytest.mark.asyncio
async def test_proxy_w_400_resizes_and_sets_cache_header(source) -> None:
    response = await proxy.proxy_image(URL, w=400)

    assert response.media_type == "image/jpeg"
    assert response.headers["cache-control"] == "public, max-age=31536000"
    assert _size(response.body) == (400, 200)


@pytest.mark.asyncio
async def test_proxy_w_does_not_upscale(source) -> None:
    source["body"] = _jpeg(200, 100)

    response = await proxy.proxy_image(URL, w=400)

    assert _size(response.body) == (200, 100)


@pytest.mark.asyncio
@pytest.mark.parametrize("w", [0, 100, 399, 800, -1])
async def test_proxy_rejects_other_widths(source, w) -> None:
    with pytest.raises(HTTPException) as exc:
        await proxy.proxy_image(URL, w=w)

    assert exc.value.status_code == 422
    assert source["stream_fetches"] == 0


@pytest.mark.asyncio
async def test_proxy_without_w_streams_original_bytes(source) -> None:
    response = await proxy.proxy_image(URL)

    body = b"".join([chunk async for chunk in response.body_iterator])
    assert body == source["body"]
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.asyncio
async def test_proxy_w_still_blocks_private_hosts(source) -> None:
    with pytest.raises(HTTPException) as exc:
        await proxy.proxy_image("http://127.0.0.1/x.jpg", w=400)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_proxy_w_rejects_oversized_source(source, monkeypatch) -> None:
    monkeypatch.setattr(proxy, "MAX_RESIZE_SOURCE_BYTES", 10)

    with pytest.raises(HTTPException) as exc:
        await proxy.proxy_image(URL, w=400)

    assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_proxy_w_rejects_undecodable_body(source) -> None:
    source["body"] = b"not an image"

    with pytest.raises(HTTPException) as exc:
        await proxy.proxy_image(URL, w=400)

    assert exc.value.status_code == 422


def _client_error(code: str):
    from botocore.exceptions import ClientError
    return ClientError({"Error": {"Code": code}}, "HeadObject")


def test_backfill_creates_missing_small_variant(s3) -> None:
    s3.head_object.side_effect = _client_error("404")
    s3.get_object.return_value = {"Body": io.BytesIO(_jpeg(1200, 600))}

    assert backfill_small_thumbnails._create_small(s3, "thumbnails/r/a.jpg", dry_run=False) is True

    put = s3.put_object.call_args.kwargs
    assert put["Key"] == "thumbnails/r/a_sm.jpg"
    assert _size(put["Body"]) == (400, 200)


def test_backfill_skips_existing_small_variant(s3) -> None:
    assert backfill_small_thumbnails._create_small(s3, "thumbnails/r/a.jpg", dry_run=False) is False

    s3.put_object.assert_not_called()


def test_backfill_dry_run_writes_nothing(s3) -> None:
    s3.head_object.side_effect = _client_error("404")

    assert backfill_small_thumbnails._create_small(s3, "thumbnails/r/a.jpg", dry_run=True) is True

    s3.get_object.assert_not_called()
    s3.put_object.assert_not_called()
