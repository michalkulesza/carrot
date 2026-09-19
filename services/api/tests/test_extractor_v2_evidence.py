from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.services.extraction_v2.contracts import ExtractionInput
from api.services.extraction_v2.evidence import normalize_evidence_text, reference_matches, text_reference


def test_text_reference_round_trips_unicode_and_normalisation() -> None:
    source = ExtractionInput(content="Składniki:\n½  cup&nbsp; crème fraîche", evidence_ids=["arbitrary-id"])
    start = source.content.index("½")
    reference = text_reference(source, start, len(source.content))

    assert reference.evidence_id == "arbitrary-id"
    assert reference.quote == "½ cup crème fraîche"
    assert reference_matches(reference, source.content)
    assert normalize_evidence_text(" a\n b &amp; c ") == "a b & c"


@pytest.mark.parametrize(
    "spans",
    [
        [{"evidence_id": "a", "start": 0, "end": 2}, {"evidence_id": "b", "start": 1, "end": 3}],
        [{"evidence_id": "missing", "start": 0, "end": 1}],
        [{"evidence_id": "a", "start": 0, "end": 4}],
    ],
)
def test_input_rejects_invalid_spans(spans: list[dict[str, object]]) -> None:
    with pytest.raises(ValidationError):
        ExtractionInput(content="abc", evidence_ids=["a", "b"], spans=spans)


def test_multiple_evidence_ids_require_spans() -> None:
    with pytest.raises(ValidationError):
        ExtractionInput(content="abc", evidence_ids=["a", "b"])
