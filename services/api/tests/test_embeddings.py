from types import SimpleNamespace

import pytest

from api.services.embeddings import _embedding_values, build_embedding_document, embedding_document_hash


def _recipe() -> SimpleNamespace:
    return SimpleNamespace(
        title="Spicy stew",
        components=[{"name": "Stew", "ingredients": ["chili", "beans"], "steps": ["Simmer"]}],
        notes="Serve warm",
        total_time_minutes=45,
        kcal_per_serving=350,
        protein_per_serving=18,
        fat_per_serving=10,
        carbs_per_serving=45,
        thumbnail_url="https://private.example/image.jpg",
        source_url="https://private.example/source",
        creator_handle="private-author",
        tags=[SimpleNamespace(name="Comfort Food"), SimpleNamespace(name="Vegan")],
    )


def test_embedding_document_is_deterministic_and_excludes_private_metadata() -> None:
    document = build_embedding_document(_recipe())

    assert document == build_embedding_document(_recipe())
    assert "Spicy stew" in document
    assert "Comfort Food" in document
    assert "private.example" not in document
    assert "private-author" not in document
    assert len(embedding_document_hash(document)) == 64


def test_embedding_vector_length_is_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("api.services.embeddings.settings.gemini_embedding_dimensions", 3)
    response = SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1, 0.2, 0.3])])

    assert _embedding_values(response) == [0.1, 0.2, 0.3]

    invalid_response = SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1])])
    with pytest.raises(ValueError, match="invalid embedding vector length"):
        _embedding_values(invalid_response)
