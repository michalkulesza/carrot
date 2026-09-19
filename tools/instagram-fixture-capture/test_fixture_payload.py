from fixture_payload import (
    build_fixture,
    build_html_fixture,
    is_http_url,
    is_instagram_post_url,
)
from capture_instagram_fixtures import _full_video_url
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


def test_full_video_url_removes_browser_byte_range_parameters() -> None:
    video_url = "https://cdn.example/video.mp4?token=abc&bytestart=0&byteend=817"

    assert _full_video_url(video_url) == "https://cdn.example/video.mp4?token=abc"
