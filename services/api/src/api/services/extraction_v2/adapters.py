"""Production adapters for v2 dependencies that remain injectable in tests."""

from __future__ import annotations

import re
import unicodedata

from api.services import gemini
from api.services.extraction_v2.contracts import (
    AudioExtractionInput, ExtractedRecipe, IngredientEvidence, RecipeComponentEvidence, StepEvidence,
)


_WORD = re.compile(r"\w+", re.UNICODE)


def _comparison_word(value: str) -> str:
    """Normalize only for matching a model quote back to its transcript."""

    # Gemini occasionally emits U+0178 in Polish words that contain U+017C.
    # This is not a translation or correction: it lets us recover the exact
    # source substring only when every word otherwise matches in order.
    value = value.replace("Ÿ", "z").replace("ÿ", "z")
    return "".join(
        character for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


def _ground_transcript_wording(value: str, transcript: str) -> str:
    """Return the exact transcript substring for a word-for-word model quote."""

    target = [_comparison_word(match.group()) for match in _WORD.finditer(value)]
    source = [(_comparison_word(match.group()), match.start(), match.end()) for match in _WORD.finditer(transcript)]
    if not target or len(target) > len(source):
        return value
    for start in range(len(source) - len(target) + 1):
        if [word for word, _, _ in source[start:start + len(target)]] == target:
            end = source[start + len(target) - 1][2]
            punctuation = value.rstrip()[-1:]
            if punctuation in {".", "!", "?"} and transcript[end:end + 1] == punctuation:
                end += 1
            return transcript[source[start][1]:end]
    return value


class GeminiAudioEvidenceExtractor:
    """Convert validated Gemini transcript evidence into the v2 evidence contract."""

    def __init__(self, *, model: str | None = None, usage: gemini.UsageTracker | None = None) -> None:
        self._model = model
        self._usage = usage

    async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe:
        result = await gemini.extract_audio_recipe_evidence(
            source.transcript,
            source.retained_recipe.model_dump(mode="json"),
            model=self._model,
            usage=self._usage,
        )
        retained_has_ingredients = any(component.ingredients for component in source.retained_recipe.components)
        retained_has_steps = any(component.steps for component in source.retained_recipe.components)
        return ExtractedRecipe(
            # Audio fallback supplies only missing ingredients/instructions. A
            # model-inferred title is optional, unstable, and has no grounded
            # title-reference contract, so it must not change the recipe title.
            title=None,
            failure_reason=result.failure_reason,
            components=[
                RecipeComponentEvidence(
                    name=component.name,
                    ingredients=[] if retained_has_ingredients else [
                        IngredientEvidence(
                            text=_ground_transcript_wording(text, source.transcript), evidence_ids=["transcript:0"],
                        ) for text in component.ingredients
                    ],
                    steps=[] if retained_has_steps else [
                        StepEvidence(
                            text=_ground_transcript_wording(text, source.transcript), evidence_ids=["transcript:0"],
                        ) for text in component.steps
                    ],
                )
                for component in result.components
            ],
        )
