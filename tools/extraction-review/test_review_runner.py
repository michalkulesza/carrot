from __future__ import annotations

import importlib.util
import json
from pathlib import Path


def test_spreadsheet_cells_are_literal_text() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.literal_cell("=SUM(A1:A2)") == "'=SUM(A1:A2)"
    assert module.literal_cell("caption") == "caption"


def test_discovery_deduplicates_and_skips_capture_bookkeeping(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    capture = tmp_path / "capture"
    capture.mkdir()
    case = capture / "case.json"
    case.write_text("{}", encoding="utf-8")
    (capture / "failed-urls.json").write_text("[]", encoding="utf-8")

    paths, skipped = module.discover([str(capture), str(case)])

    assert paths == [case]
    assert any("bookkeeping" in item for item in skipped)
    assert any("duplicate" in item for item in skipped)


def test_discovered_paths_can_be_sliced_deterministically(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name in ("b.json", "a.json", "c.json"):
        (tmp_path / name).write_text("{}", encoding="utf-8")

    paths, _ = module.discover([str(tmp_path)])

    assert [path.name for path in paths[1:3]] == ["b.json", "c.json"]


def test_summary_yield_uses_source_text_when_no_servings_count() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.display_yield({"yield_text": "1 burger", "yield_servings": None}) == "1 burger"
    assert module.display_yield({"yield_text": "8 rolls", "yield_servings": "8"}) == "8"


def test_review_components_preserves_recipe_grouping() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    components = module.review_components({"components": [
        {"ingredients": [{"text": "1 chicken breast"}]},
        {"name": "Seasoning:", "ingredients": [{"text": "1 tsp paprika"}]},
        {"steps": [{"text": "Cook the chicken."}]},
    ]})

    assert components == [
        {"ingredients": [{"text": "1 chicken breast"}]},
        {"name": "Seasoning:", "ingredients": [{"text": "1 tsp paprika"}]},
        {"steps": ["Cook the chicken."]},
    ]


def test_testable_expectation_matches_the_regression_fixture_shape() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    expectation = module.testable_expectation({
        "capture_errors": [], "detected_languages": "en",
        "report_recipe": {
            "title": "Burger", "yield_servings": "1", "total_time_minutes": 20,
            "nutrition": {"calories": None, "protein": None, "fat": None, "carbohydrates": None},
            "components": [{"name": "Seasoning:", "ingredients": [{"text": "1 tsp paprika"}]}],
        },
    })

    assert expectation == {
        "capture_errors": "", "detected_languages": "en",
        "recipe": {
            "title": "Burger", "yield": "1", "total_time_minutes": 20,
            "nutrition": {"calories": None, "protein": None, "fat": None, "carbohydrates": None},
            "components": [{"name": "Seasoning:", "ingredients": [{"text": "1 tsp paprika"}]}],
        },
    }


def test_readable_recipe_item_keeps_ingredient_links_as_objects() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    item = module.readable_recipe_item({
        "original_wording": "1 Tbsp rice wine", "group": "Main", "order": 1, "evidence_ids": "html:0",
        "locator": "/li[0]", "link_url": "https://example.com/rice-wine",
        "references": "[]", "links": '[{"text":"rice wine","url":"https://example.com/rice-wine","references":[]}]',
    }, "ingredient")

    assert item["ingredient"] == "1 Tbsp rice wine"
    assert item["link_url"] == "https://example.com/rice-wine"
    assert item["links"] == [{"text": "rice wine", "url": "https://example.com/rice-wine", "references": []}]


def test_exception_diagnostic_records_provider_details_and_redacts_secrets() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class ClientError(Exception):
        status = 429
        code = "RESOURCE_EXHAUSTED"
        details = {"reason": "quota", "api_key": "AIza-secret-value"}

    diagnostic = module.exception_diagnostic(ClientError("Bearer super-secret"))

    assert diagnostic["type"] == "ClientError"
    assert diagnostic["status"] == 429
    assert diagnostic["code"] == "RESOURCE_EXHAUSTED"
    assert "super-secret" not in diagnostic["message"]
    assert diagnostic["details"]["api_key"] == "[REDACTED]"


def test_report_keeps_structured_model_error_in_review_json(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    module.report([{
        "case_id": "case-1", "input_file": "capture.json", "input_sha256": "hash",
        "model_calls": [{
            "status": "error", "model": "gemini-test", "error": {
                "type": "ClientError", "message": "quota exceeded", "status": 429,
                "details": {"reason": "quota"},
            },
        }],
    }], tmp_path, {}, False)

    artifact = json.loads((tmp_path / "review.json").read_text(encoding="utf-8"))
    assert artifact["cases"][0]["model_calls"][0]["error"]["status"] == 429
