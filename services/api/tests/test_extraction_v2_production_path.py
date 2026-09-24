"""Offline contract checks through the production v2 acquisition boundary."""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import pytest
from fastapi import Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.services import gemini
from api.services.extraction_v2 import production
from api.services.extraction_v2 import sources
from api.services.scraper import parse_scrapecreators_reel_response
from api.services import transcription
from api import models
from api.database import Base
from api.routes import imports, recipes
from api.services import import_worker
from api.users import User
from api.services.extraction_v2.contracts import FailureReason


CAPTURES = Path(__file__).parent / "captured-payloads"


def _no_gemini(*_args, **_kwargs):
    raise AssertionError("production-path tests must not call Gemini")


@pytest.mark.asyncio
async def test_captured_html_import_retains_source_facts_and_final_url(monkeypatch):
    capture = json.loads((CAPTURES / "html-www-andy-cooks-com-blogs-recipes-chicken-teriyaki.json").read_text(encoding="utf-8"))
    requested_url = "https://www.andy-cooks.com/old-chicken-teriyaki"
    final_url = capture["source_url"]
    real_client = httpx.AsyncClient

    def respond(request):
        if str(request.url) == requested_url:
            return httpx.Response(302, headers={"location": final_url})
        assert str(request.url) == final_url
        return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text=capture["html"])

    monkeypatch.setattr(production.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(sources, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome, metadata, source_capture = await production.acquire_and_extract_url(requested_url, gemini.UsageTracker())

    assert outcome.outcome == "complete", outcome.model_dump(mode="json")
    assert metadata.source_url == final_url
    assert source_capture["final_url"] == final_url
    assert outcome.recipe.title == "Chicken teriyaki"
    assert "6 chicken thighs, skin on" in [item.text for component in outcome.recipe.components for item in component.ingredients]
    assert "Place chicken in a cold oiled frying pan, skin side down and place over a medium high heat." in [step.text for component in outcome.recipe.components for step in component.steps]
    assert {source.id for source in outcome.evidence} == {"html:0"}
    assert all(item.evidence_ids == ["html:0"] for component in outcome.recipe.components for item in component.ingredients)


async def _safe():
    return True


@pytest.mark.asyncio
async def test_non_recipe_pasted_text_returns_typed_failure(monkeypatch):
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome = await production.extract_pasted_text(
        "This is a travel note about a mountain walk. We saw birds and returned home before sunset.",
        gemini.UsageTracker(),
    )

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.NO_RECIPE_CONTENT
    assert not hasattr(outcome, "recipe")


@pytest.mark.asyncio
async def test_unavailable_social_metadata_returns_typed_fetch_failure(monkeypatch):
    url = "https://www.instagram.com/reel/unavailable/"

    async def unavailable(_url):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(production.scraper, "fetch_reel", unavailable)
    monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(production.httpx, "AsyncClient", lambda **_kwargs: _no_gemini())
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome, metadata, source_capture = await production.acquire_and_extract_url(url, gemini.UsageTracker())

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.SOURCE_FETCH_FAILED
    assert metadata.source_url == url
    assert source_capture == {}


@pytest.mark.asyncio
async def test_complete_instagram_caption_needs_no_link_or_audio(monkeypatch):
    url = "https://www.instagram.com/reel/caption-recipe/"
    linked_url = "https://recipes.example/long-version"
    caption = (
        "Chicken rice\nIngredients\n1 cup rice\n2 chicken thighs\n"
        "Instructions\nCook rice until tender.\nBake chicken until done.\n"
        f"Full recipe: {linked_url}"
    )
    response = {"data": {"xdt_shortcode_media": {
        "owner": {"username": "recipeauthor"},
        "edge_media_to_caption": {"edges": [{"node": {"text": caption}}]},
        "video_url": "https://media.example/video.mp4",
    }}}
    metadata = parse_scrapecreators_reel_response(response, url)

    async def fetch_reel(_url):
        assert _url == url
        return metadata

    def no_http(*_args, **_kwargs):
        raise AssertionError("complete caption must not fetch a linked page")

    monkeypatch.setattr(production.scraper, "fetch_reel", fetch_reel)
    monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(sources, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(production.httpx, "AsyncClient", no_http)
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome, metadata, _capture = await production.acquire_and_extract_url(url, gemini.UsageTracker())

    assert outcome.outcome == "complete"
    assert metadata.source_url == url
    assert "1 cup rice" in [item.text for component in outcome.recipe.components for item in component.ingredients]
    assert "Cook rice until tender." in [step.text for component in outcome.recipe.components for step in component.steps]
    assert not any(item.event in {"linked_page_merged", "transcribed", "audio_merged"} for item in outcome.trace)


@pytest.mark.asyncio
@pytest.mark.parametrize("link_location", ["caption", "creator_comment"])
async def test_recipe_link_completes_caption_before_audio_and_viewer_link_is_ignored(monkeypatch, link_location):
    url = "https://www.instagram.com/reel/comment-recipe/"
    recipe_url = "https://recipes.example/chicken-rice"
    viewer_url = "https://viewers.example/untrusted"
    caption = "Chicken rice\nIngredients\n1 cup rice\n2 chicken thighs"
    if link_location == "caption":
        caption += f"\nFull recipe: {recipe_url}"
    response = {"data": {"xdt_shortcode_media": {
        "owner": {"username": "recipeauthor", "id": "author-1"},
        "edge_media_to_caption": {"edges": [{"node": {"text": caption}}]},
        "video_url": "https://media.example/video.mp4",
    }}, "comments": [
        *([{"id": "creator-comment", "text": f"Full recipe: {recipe_url}", "owner": {"username": "recipeauthor", "id": "author-1"}, "is_owner": True}]
          if link_location == "creator_comment" else []),
        {"id": "viewer-comment", "text": f"Try this: {viewer_url}", "owner": {"username": "viewer", "id": "viewer-1"}, "is_owner": False},
    ]}
    metadata = parse_scrapecreators_reel_response(response, url)
    fetched = []
    real_client = httpx.AsyncClient

    def respond(request):
        fetched.append(str(request.url))
        assert str(request.url) == recipe_url
        return httpx.Response(200, headers={"content-type": "text/html"}, text=(
            "<html lang='en'><body><h1>Chicken rice</h1><h2>Instructions</h2>"
            "<p>Cook rice until tender.</p><p>Bake chicken until done.</p></body></html>"
        ))

    async def fetch_reel(_url):
        return metadata

    monkeypatch.setattr(production.scraper, "fetch_reel", fetch_reel)
    monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(sources, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(production.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome, _metadata, _capture = await production.acquire_and_extract_url(url, gemini.UsageTracker())

    assert outcome.outcome == "complete", (fetched, [(item.event, item.detail) for item in outcome.trace], outcome.recipe.model_dump(mode="json"))
    assert fetched == [recipe_url]
    assert any(item.event == "linked_page_merged" for item in outcome.trace)
    assert not any(item.event in {"transcribed", "audio_merged"} for item in outcome.trace)
    assert "1 cup rice" in [item.text for component in outcome.recipe.components for item in component.ingredients]
    assert "Cook rice until tender." in [step.text for component in outcome.recipe.components for step in component.steps]
    assert {item.id for item in outcome.evidence} >= {"caption:0", "linked_page:0"}
    assert ("creator_comment:0" in {item.id for item in outcome.evidence}) == (link_location == "creator_comment")
    assert all(viewer_url not in item.text for item in outcome.evidence)


@pytest.mark.asyncio
async def test_captured_instagram_transcript_fills_missing_instructions_offline(monkeypatch):
    capture = json.loads((CAPTURES / "instagram-DavQuNhRKjI.json").read_text(encoding="utf-8"))
    audio_fixture = json.loads((Path(__file__).parent / "fixtures/extraction_v2/audio_responses/instagram-DavQuNhRKjI.json").read_text(encoding="utf-8"))
    url = capture["source_url"]
    response = json.loads(json.dumps(capture["scrapecreators_response"]))
    response["data"]["xdt_shortcode_media"]["edge_media_to_caption"]["edges"][0]["node"]["text"] = (
        "Butter chicken rice\nIngredients\n1 cup rice\n2 chicken thighs"
    )
    metadata = parse_scrapecreators_reel_response(response, url)

    async def fetch_reel(_url):
        assert _url == url
        return metadata

    async def transcribe(_video_url):
        assert _video_url == metadata.video_url
        return capture["audio"]["transcript"]

    async def replay_audio(*_args, **_kwargs):
        return gemini.AudioRecipeEvidence.model_validate(audio_fixture["response"])

    def no_http(*_args, **_kwargs):
        raise AssertionError("no live linked-page HTTP is allowed")

    monkeypatch.setattr(production.scraper, "fetch_reel", fetch_reel)
    monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(sources, "is_safe_public_destination", lambda _url: _safe())
    monkeypatch.setattr(production.httpx, "AsyncClient", no_http)
    monkeypatch.setattr(transcription, "transcribe_video", transcribe)
    monkeypatch.setattr(gemini, "extract_audio_recipe_evidence", replay_audio)
    monkeypatch.setattr(gemini, "_build_client", _no_gemini)

    outcome, _metadata, _source_capture = await production.acquire_and_extract_url(url, gemini.UsageTracker())

    assert outcome.outcome == "complete"
    assert any(item.event == "transcribed" for item in outcome.trace)
    assert any(item.event == "audio_merged" for item in outcome.trace)
    assert {item.id for item in outcome.evidence} >= {"caption:0", "transcript:0"}
    assert any(step.evidence_ids == ["transcript:0"] for component in outcome.recipe.components for step in component.steps)


@pytest.mark.asyncio
async def test_import_job_persists_partial_url_source_facts_and_is_idempotent(monkeypatch):
    database_url = os.getenv("CARROT_ISOLATED_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("requires an isolated disposable Postgres database")
    parsed = urlsplit(database_url)
    assert parsed.hostname in {"localhost", "127.0.0.1"}
    assert parsed.port != 5432
    assert parsed.path.lstrip("/").startswith("carrot_extraction_v2_test_")
    engine = create_async_engine(database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await connection.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(import_worker, "async_session_maker", maker)
        monkeypatch.setattr(gemini, "_build_client", _no_gemini)
        url = "https://www.instagram.com/reel/partial-chicken-rice/"
        response = {"data": {"xdt_shortcode_media": {
            "owner": {"username": "recipeauthor"},
            "edge_media_to_caption": {"edges": [{"node": {"text": "Chicken rice\nIngredients\n1 cup rice\n2 chicken thighs"}}]},
        }}}
        metadata = parse_scrapecreators_reel_response(response, url)

        async def fetch_reel(_url):
            assert _url == url
            return metadata

        monkeypatch.setattr(production.scraper, "fetch_reel", fetch_reel)
        monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
        monkeypatch.setattr(production.httpx, "AsyncClient", lambda **_kwargs: _no_gemini())

        async def enrich(extracted, *_args, **_kwargs):
            return models.RecipeExtraction(
                title=extracted.title,
                components=[models.RecipeComponent(
                    name=component.name,
                    ingredients=[models.Ingredient(name=item.text, shopping_list_value=item.text) for item in component.ingredients],
                    steps=[step.text for step in component.steps],
                    ingredient_evidence=[{"references": [ref.model_dump(mode="json") for ref in item.references]} for item in component.ingredients],
                ) for component in extracted.components],
            )

        monkeypatch.setattr(gemini, "enrich_v2_recipe", enrich)
        user = User(email=f"extract-{uuid4()}@example.com", hashed_password="unused", is_active=True, is_verified=True)
        household = models.Household(name="Extraction v2 test", invite_code=uuid4().hex[:8])
        async with maker() as session:
            session.add_all([user, household])
            await session.flush()
            session.add(models.HouseholdMember(user_id=user.id, household_id=household.id))
            await session.commit()
        async with maker() as session:
            created = await imports.enqueue_import_job(
                models.ImportJobCreate(kind=models.ImportJobKind.URL, input={"url": url}, idempotency_key=uuid4()),
                Response(), user, session, household.id,
            )
        claimed = await import_worker._claim_job()
        assert claimed == created.id
        await import_worker._process_job(created.id)
        await import_worker._process_job(created.id)
        async with maker() as session:
            job = await session.get(models.ImportJob, created.id)
            assert job.status == models.ImportJobStatus.SUCCEEDED
            assert job.outcome == "incomplete"
            assert job.result_recipe_id is not None
            saved = await recipes.get_recipe(str(job.result_recipe_id), user, session, household.id)
            evidence = await recipes.get_recipe_source_evidence(job.result_recipe_id, session, household.id)
            count = await session.scalar(select(func.count()).select_from(models.Recipe).where(models.Recipe.author_id == user.id))
            assert saved.issue_codes == ["MISSING_INSTRUCTIONS"]
            assert saved.source_url == url
            assert saved.components[0]["ingredients"] == ["1 cup rice", "2 chicken thighs"]
            assert saved.components[0]["steps"] == []
            assert evidence["evidence"][0]["id"] == "caption:0"
            assert count == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_image_job_persists_v2_recipe_and_private_source_capture(monkeypatch):
    database_url = os.getenv("CARROT_ISOLATED_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("requires an isolated disposable Postgres database")
    parsed = urlsplit(database_url)
    assert parsed.hostname in {"localhost", "127.0.0.1"}
    assert parsed.port != 5432
    assert parsed.path.lstrip("/").startswith("carrot_extraction_v2_test_")
    engine = create_async_engine(database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    image = b"image-fixture"
    encoded = base64.b64encode(image).decode()
    transcript = "Tomato Soup\nServes 2\nIngredients\n2 tomatoes\nInstructions\nChop tomatoes and simmer."
    vision_calls = []
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await connection.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(import_worker, "async_session_maker", maker)
        monkeypatch.setattr(gemini, "_build_client", _no_gemini)

        async def transcribe(data, mime_type, model=None, usage=None):
            vision_calls.append((data, mime_type))
            return transcript

        async def enrich(extracted, *_args, **_kwargs):
            return models.RecipeExtraction(
                title=extracted.title,
                title_evidence=[ref.model_dump(mode="json") for ref in extracted.title_references],
                components=[models.RecipeComponent(
                    name=component.name,
                    ingredients=[models.Ingredient(name=item.text, shopping_list_value=item.text)
                                 for item in component.ingredients],
                    steps=[step.text for step in component.steps],
                ) for component in extracted.components],
            )

        monkeypatch.setattr(gemini, "transcribe_image_text", transcribe)
        monkeypatch.setattr(gemini, "enrich_v2_recipe", enrich)
        user = User(email=f"image-{uuid4()}@example.com", hashed_password="unused", is_active=True, is_verified=True)
        household = models.Household(name="Image v2 test", invite_code=uuid4().hex[:8])
        async with maker() as session:
            session.add_all([user, household])
            await session.flush()
            session.add(models.HouseholdMember(user_id=user.id, household_id=household.id))
            await session.commit()
        async with maker() as session:
            created = await imports.enqueue_import_job(
                models.ImportJobCreate(kind=models.ImportJobKind.IMAGE, input={
                    "image_base64": encoded, "mime_type": "image/webp",
                }, idempotency_key=uuid4()),
                Response(), user, session, household.id,
            )
        assert await import_worker._claim_job() == created.id
        await import_worker._process_job(created.id)
        await import_worker._process_job(created.id)
        async with maker() as session:
            job = await session.get(models.ImportJob, created.id)
            assert job.status == models.ImportJobStatus.SUCCEEDED
            assert job.outcome == "complete"
            assert job.input == {}
            recipe = await recipes.get_recipe(str(job.result_recipe_id), user, session, household.id)
            source = await session.get(models.RecipeSourceEvidence, job.result_recipe_id)
            count = await session.scalar(select(func.count()).select_from(models.Recipe).where(models.Recipe.author_id == user.id))
            assert recipe.title == "Tomato Soup"
            assert recipe.title_evidence[0]["quote"] == "Tomato Soup"
            assert recipe.components[0]["ingredients"] == ["2 tomatoes"]
            assert recipe.components[0]["steps"] == ["Chop tomatoes and simmer."]
            assert source.evidence[0]["kind"] == "image_transcript"
            assert source.evidence[0]["text"] == transcript
            assert source.capture["transcript"] == transcript
            assert base64.b64decode(source.capture["image_base64"]) == image
            assert count == 1
        assert vision_calls == [(image, "image/webp")]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_unsupported_url_job_exposes_typed_failure_without_recipe(monkeypatch):
    database_url = os.getenv("CARROT_ISOLATED_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("requires an isolated disposable Postgres database")
    parsed = urlsplit(database_url)
    assert parsed.hostname in {"localhost", "127.0.0.1"}
    assert parsed.port != 5432
    assert parsed.path.lstrip("/").startswith("carrot_extraction_v2_test_")
    engine = create_async_engine(database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await connection.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(import_worker, "async_session_maker", maker)
        monkeypatch.setattr(production, "is_safe_public_destination", lambda _url: _safe())
        monkeypatch.setattr(production.httpx, "AsyncClient", lambda **_kwargs: _no_gemini())
        monkeypatch.setattr(gemini, "_build_client", _no_gemini)
        user = User(email=f"extract-{uuid4()}@example.com", hashed_password="unused", is_active=True, is_verified=True)
        household = models.Household(name="Extraction v2 failure test", invite_code=uuid4().hex[:8])
        async with maker() as session:
            session.add_all([user, household])
            await session.flush()
            session.add(models.HouseholdMember(user_id=user.id, household_id=household.id))
            await session.commit()
        async with maker() as session:
            created = await imports.enqueue_import_job(
                models.ImportJobCreate(kind=models.ImportJobKind.URL, input={"url": "https://www.facebook.com/watch/123"}, idempotency_key=uuid4()),
                Response(), user, session, household.id,
            )
        assert await import_worker._claim_job() == created.id
        await import_worker._process_job(created.id)
        async with maker() as session:
            job = await session.get(models.ImportJob, created.id)
            assert job.status == models.ImportJobStatus.FAILED
            assert job.failure_code == "unsupported_source"
            assert job.result_recipe_id is None
            assert await session.scalar(select(func.count()).select_from(models.Recipe).where(models.Recipe.author_id == user.id)) == 0
    finally:
        await engine.dispose()
