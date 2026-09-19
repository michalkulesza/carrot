"""Production adapters for v2 dependencies that remain injectable in tests."""

from __future__ import annotations

from api.services import gemini
from api.services.extraction_v2.contracts import (
    AudioExtractionInput, ExtractedRecipe, IngredientEvidence, RecipeComponentEvidence, StepEvidence,
)


class GeminiAudioEvidenceExtractor:
    """Convert validated Gemini transcript evidence into the v2 evidence contract."""

    async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe:
        result = await gemini.extract_audio_recipe_evidence(source.transcript, source.retained_recipe.model_dump(mode="json"))
        return ExtractedRecipe(
            title=result.title,
            failure_reason=result.failure_reason,
            components=[
                RecipeComponentEvidence(
                    name=component.name,
                    ingredients=[IngredientEvidence(text=text, evidence_ids=["transcript:0"]) for text in component.ingredients],
                    steps=[StepEvidence(text=text, evidence_ids=["transcript:0"]) for text in component.steps],
                )
                for component in result.components
            ],
        )
