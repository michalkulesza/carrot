from __future__ import annotations

import importlib.util


def test_spreadsheet_cells_are_literal_text() -> None:
    spec = importlib.util.spec_from_file_location("review_runner", "tools/extraction-review/run_review.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.literal_cell("=SUM(A1:A2)") == "'=SUM(A1:A2)"
    assert module.literal_cell("caption") == "caption"
