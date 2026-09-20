from __future__ import annotations

import importlib.util
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
