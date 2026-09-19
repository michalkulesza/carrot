"""Validated, source-neutral contracts used by extraction v2."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, Field, HttpUrl, TypeAdapter, model_validator


class SourceKind(StrEnum):
    HTML = "html"
    SOCIAL = "social"


class EvidenceKind(StrEnum):
    HTML = "html"
    CAPTION = "caption"
    CREATOR_COMMENT = "creator_comment"
    LINKED_PAGE = "linked_page"
    TRANSCRIPT = "transcript"


class ExtractionStage(StrEnum):
    INPUT = "input"
    LANGUAGE = "language"
    TEXT = "text"
    LINKED_PAGE = "linked_page"
    TRANSCRIPT = "transcript"
    AUDIO_MODEL = "audio_model"
    COMPLETE = "complete"


class IssueCode(StrEnum):
    MISSING_INGREDIENTS = "MISSING_INGREDIENTS"
    MISSING_INSTRUCTIONS = "MISSING_INSTRUCTIONS"


class FailureReason(StrEnum):
    INVALID_INPUT = "INVALID_INPUT"
    UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE"
    LANGUAGE_UNDETERMINED = "LANGUAGE_UNDETERMINED"
    NO_RECIPE_CONTENT = "NO_RECIPE_CONTENT"
    AMBIGUOUS_RECIPE = "AMBIGUOUS_RECIPE"
    UNREADABLE_CONTENT = "UNREADABLE_CONTENT"
    SOURCE_FETCH_FAILED = "SOURCE_FETCH_FAILED"
    TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED"
    MODEL_TIMEOUT = "MODEL_TIMEOUT"
    MODEL_RATE_LIMITED = "MODEL_RATE_LIMITED"
    INVALID_MODEL_RESPONSE = "INVALID_MODEL_RESPONSE"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


class Capture(BaseModel):
    status: Literal["complete", "partial", "failed"]
    errors: list[str] = Field(default_factory=list)


class Comment(BaseModel):
    id: str | None = None
    parent_comment_id: str | None = None
    author_id: str | None = None
    author_handle: str | None = None
    text: str
    is_creator_authored: bool | None = None
    authorship_evidence: str | None = None


class Audio(BaseModel):
    video_url: str | None = None
    audio_url: str | None = None
    audio_title: str | None = None
    transcript: str | None = None
    status: str
    transcription_error: str | None = None


class SocialPayload(BaseModel):
    schema_version: Literal[1]
    kind: Literal[SourceKind.SOCIAL]
    source_url: HttpUrl
    capture: Capture
    scrapecreators_response: dict
    comments: list[Comment] = Field(default_factory=list)
    audio: Audio


class HtmlPayload(BaseModel):
    schema_version: Literal[1]
    kind: Literal[SourceKind.HTML]
    source_url: HttpUrl
    capture: Capture
    html: str


SourcePayload = Annotated[SocialPayload | HtmlPayload, Field(discriminator="kind")]
SOURCE_PAYLOAD_ADAPTER = TypeAdapter(SourcePayload)


class LanguageResult(BaseModel):
    code: str | None = None
    confidence: float | None = None


class EvidenceSource(BaseModel):
    id: str
    kind: EvidenceKind
    source_url: str
    text: str
    language: LanguageResult
    locator: str | None = None
    author_verified: bool | None = None


class IngredientEvidence(BaseModel):
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    locator: str | None = None
    link_url: str | None = None


class StepEvidence(BaseModel):
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    locator: str | None = None


class RecipeComponentEvidence(BaseModel):
    name: str | None = None
    ingredients: list[IngredientEvidence] = Field(default_factory=list)
    steps: list[StepEvidence] = Field(default_factory=list)


class ExtractedRecipe(BaseModel):
    title: str | None = None
    components: list[RecipeComponentEvidence] = Field(default_factory=list)
    failure_reason: FailureReason | None = None

    @model_validator(mode="after")
    def validate_failure_shape(self) -> ExtractedRecipe:
        model_reasons = {
            FailureReason.NO_RECIPE_CONTENT,
            FailureReason.AMBIGUOUS_RECIPE,
            FailureReason.UNREADABLE_CONTENT,
        }
        has_facts = any(component.ingredients or component.steps for component in self.components)
        if self.failure_reason and self.failure_reason not in model_reasons:
            raise ValueError("extractors may only return model-selectable content failure reasons")
        if self.failure_reason and has_facts:
            raise ValueError("an extraction cannot contain both recipe facts and a terminal failure reason")
        return self


def validate_extracted_recipe(value: object, allowed_evidence_ids: set[str] | None = None) -> ExtractedRecipe:
    """Validate provider output at the orchestrator boundary."""

    recipe = ExtractedRecipe.model_validate(value)
    if allowed_evidence_ids is None:
        return recipe
    for component in recipe.components:
        for fact in [*component.ingredients, *component.steps]:
            if not set(fact.evidence_ids).issubset(allowed_evidence_ids):
                raise ValueError("extractor referenced evidence outside its supplied input")
    return recipe


class ExtractionInput(BaseModel):
    """Source-agnostic input. Evidence identifiers are opaque to the extractor."""

    content: str
    evidence_ids: list[str] = Field(default_factory=list)


class AudioExtractionInput(BaseModel):
    transcript: str
    retained_recipe: ExtractedRecipe


class TraceEvent(BaseModel):
    stage: ExtractionStage
    event: str
    detail: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


class BaseOutcome(BaseModel):
    source_url: str
    evidence: list[EvidenceSource]
    trace: list[TraceEvent]


class CompleteOutcome(BaseOutcome):
    outcome: Literal["complete"]
    recipe: ExtractedRecipe
    issue_codes: list[IssueCode] = Field(default_factory=list)


class IncompleteOutcome(BaseOutcome):
    outcome: Literal["incomplete"]
    recipe: ExtractedRecipe
    issue_codes: list[IssueCode] = Field(min_length=1)


class FailedOutcome(BaseOutcome):
    outcome: Literal["failed"]
    reason: FailureReason
    failed_stage: ExtractionStage


ExtractionOutcome = Annotated[
    CompleteOutcome | IncompleteOutcome | FailedOutcome,
    Field(discriminator="outcome"),
]


class ExtractorV2(Protocol):
    async def extract_html(self, source: ExtractionInput) -> ExtractedRecipe: ...

    async def extract_text(self, source: ExtractionInput) -> ExtractedRecipe: ...


class AudioEvidenceExtractor(Protocol):
    async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe: ...


class LanguageDetector(Protocol):
    def detect(self, text: str) -> LanguageResult: ...
