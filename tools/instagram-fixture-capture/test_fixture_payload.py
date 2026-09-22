from fixture_payload import (
    build_fixture,
    build_html_fixture,
    is_http_url,
    is_instagram_post_url,
)
import re

from capture_instagram_fixtures import (
    HTML_DOWNLOAD_CHUNK_CHARACTERS,
    _full_video_url,
    _selected_urls,
    capture_html_url,
)
from api.services.scraper import parse_scrapecreators_reel_response


def test_instagram_post_url_validation_accepts_supported_post_types() -> None:
    assert is_instagram_post_url("https://www.instagram.com/p/example/")
    assert is_instagram_post_url("https://www.instagram.com/reel/example/")
    assert is_instagram_post_url("https://www.instagram.com/tv/example/")
    assert not is_instagram_post_url("https://www.instagram.com/example/")
    assert not is_instagram_post_url("https://example.com/reel/example/")
    assert is_http_url("https://example.com/recipe")
    assert not is_http_url("file:///recipe.html")


def test_fixture_embeds_a_scrapecreators_compatible_instagram_response() -> None:
    fixture = build_fixture(
        source_url="https://www.instagram.com/reel/example/",
        description="Ingredients: 1 onion https://example.com/full-recipe",
        creator_handle="recipe_creator",
        thumbnail_url="https://cdn.example/image.jpg",
        video_url="https://cdn.example/video.mp4",
        comments=[{
            "id": "comment-1",
            "parent_comment_id": None,
            "author_handle": "recipe_creator",
            "text": "Use a large onion.",
            "is_creator_authored": True,
            "authorship_evidence": "author handle matches post owner",
        }],
        audio_title="Original audio",
        transcript="Add the onion and simmer.",
        transcription_error=None,
        errors=[],
    )

    metadata = parse_scrapecreators_reel_response(
        fixture["scrapecreators_response"], fixture["source_url"],
    )

    assert fixture["schema_version"] == 1
    assert fixture["kind"] == "social"
    assert fixture["capture"]["status"] == "complete"
    assert fixture["comments"][0]["is_creator_authored"] is True
    assert fixture["audio"] == {
        "video_url": "https://cdn.example/video.mp4",
        "audio_url": None,
        "audio_title": "Original audio",
        "transcript": "Add the onion and simmer.",
        "status": "transcribed",
        "transcription_error": None,
    }
    assert metadata.description == "Ingredients: 1 onion https://example.com/full-recipe"
    assert metadata.creator_handle == "recipe_creator"
    assert metadata.thumbnail_url == "https://cdn.example/image.jpg"
    assert metadata.video_url == "https://cdn.example/video.mp4"
    assert metadata.linked_urls == ["https://example.com/full-recipe"]


def test_fixture_records_partial_capture_when_visible_source_data_is_missing() -> None:
    fixture = build_fixture(
        source_url="https://www.instagram.com/p/example/",
        description="",
        creator_handle="recipe_creator",
        thumbnail_url=None,
        video_url=None,
        comments=[],
        audio_title=None,
        transcript=None,
        transcription_error=None,
        errors=["Caption was not visible in the loaded post DOM."],
    )

    assert fixture["capture"]["status"] == "partial"
    assert fixture["audio"]["status"] == "unavailable"


def test_html_fixture_is_raw_orchestrator_input() -> None:
    fixture = build_html_fixture(
        "https://example.com/recipe",
        "<html><body><h1>Recipe</h1></body></html>",
        errors=[],
    )

    assert fixture["kind"] == "html"
    assert fixture["capture"]["status"] == "complete"
    assert fixture["html"] == "<html><body><h1>Recipe</h1></body></html>"


def test_html_capture_uses_chromes_rendered_document(monkeypatch) -> None:
    class Page:
        closed = False
        html = "<html><body><h1>Rendered recipe</h1></body></html>"

        def evaluate(self, expression: str):
            if "document.readyState" in expression:
                return True
            if "html_length" in expression:
                return {
                    "source_url": "https://example.com/rendered-recipe",
                    "html_length": len(self.html),
                }
            if "__carrotRenderedHtml.slice" in expression:
                return self.html
            return None

        def close(self) -> None:
            self.closed = True

    page = Page()
    monkeypatch.setattr("capture_instagram_fixtures._new_page", lambda port, url: page)
    monkeypatch.setattr("capture_instagram_fixtures.time.sleep", lambda _: None)

    fixture = capture_html_url(9222, "https://example.com/recipe", timeout_seconds=1)

    assert fixture["source_url"] == "https://example.com/rendered-recipe"
    assert fixture["html"] == "<html><body><h1>Rendered recipe</h1></body></html>"
    assert page.closed is True


def test_html_capture_downloads_large_documents_in_chunks(monkeypatch) -> None:
    class Page:
        closed = False
        html = "x" * (HTML_DOWNLOAD_CHUNK_CHARACTERS + 1)
        chunk_requests: list[str] = []

        def evaluate(self, expression: str):
            if "document.readyState" in expression:
                return True
            if "html_length" in expression:
                return {"source_url": "https://example.com/recipe", "html_length": len(self.html)}
            if "__carrotRenderedHtml.slice" in expression:
                self.chunk_requests.append(expression)
                match = re.search(r"slice\((\d+), (\d+)\)", expression)
                assert match
                return self.html[int(match.group(1)):int(match.group(2))]
            return None

        def close(self) -> None:
            self.closed = True

    page = Page()
    monkeypatch.setattr("capture_instagram_fixtures._new_page", lambda port, url: page)
    monkeypatch.setattr("capture_instagram_fixtures.time.sleep", lambda _: None)

    fixture = capture_html_url(9222, "https://example.com/recipe", timeout_seconds=1)

    assert fixture["html"] == page.html
    assert len(page.chunk_requests) == 2
    assert page.closed is True


def test_html_only_capture_omits_instagram_urls() -> None:
    instagram, html = _selected_urls(
        ["https://www.instagram.com/reel/example/"],
        ["https://example.com/recipe"],
        html_only=True,
    )

    assert instagram == []
    assert html == ["https://example.com/recipe"]


def test_full_video_url_removes_browser_byte_range_parameters() -> None:
    video_url = "https://cdn.example/video.mp4?token=abc&bytestart=0&byteend=817"

    assert _full_video_url(video_url) == "https://cdn.example/video.mp4?token=abc"
