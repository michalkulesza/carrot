"""Offline language detection for source material before extraction."""

from __future__ import annotations

from functools import cached_property

from lingua import LanguageDetectorBuilder

from api.services.extraction_v2.contracts import LanguageResult

SUPPORTED_LANGUAGE_CODES = frozenset({"en", "de", "pl", "fr", "es"})
MIN_SUBSTANTIVE_CHARACTERS = 20
# Confidence is distributed across all 75 Lingua languages. Short English recipe
# text can be correct at roughly 0.35, so use a deliberately low ambiguity gate.
MIN_CONFIDENCE = 0.25


class LinguaLanguageDetector:
    """Detect all supported-by-Lingua languages before applying Carrot's allowlist."""

    @cached_property
    def _detector(self):
        return LanguageDetectorBuilder.from_all_languages().build()

    def detect(self, text: str) -> LanguageResult:
        if len("".join(text.split())) < MIN_SUBSTANTIVE_CHARACTERS:
            return LanguageResult()

        language = self._detector.detect_language_of(text)
        if language is None:
            return LanguageResult()

        confidence = self._detector.compute_language_confidence(text, language)
        if confidence < MIN_CONFIDENCE:
            return LanguageResult(confidence=confidence)

        return LanguageResult(
            code=language.iso_code_639_1.name.lower(),
            confidence=confidence,
        )
