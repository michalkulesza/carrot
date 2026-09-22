"""Validated, source-neutral contracts used by extraction v2."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, model_validator


class SourceKind(StrEnum):
    HTML = "html"
    SOCIAL = "social"
    TEXT = "text"


class EvidenceKind(StrEnum):
    HTML = "html"
    CAPTION = "caption"
    CREATOR_COMMENT = "creator_comment"
    LINKED_PAGE = "linked_page"
    TRANSCRIPT = "transcript"
    PASTED_TEXT = "pasted_text"


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
    UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE"
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


class TextPayload(BaseModel):
    schema_version: Literal[1]
    kind: Literal[SourceKind.TEXT]
    source_url: str = ""
    capture: Capture = Field(default_factory=lambda: Capture(status="complete"))
    text: str = Field(min_length=1, max_length=20000)


SourcePayload = Annotated[SocialPayload | HtmlPayload | TextPayload, Field(discriminator="kind")]
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


class EvidenceSpan(BaseModel):
    """A half-open range in the exact content passed to an extractor."""

    evidence_id: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class EvidenceReference(BaseModel):
    """A resolvable quotation from an extractor input.

    ``text`` locators use ``start:end`` character offsets. HTML locators use
    ``node-path:start:end`` offsets into the rendered text of that node.
    """

    evidence_id: str
    locator_kind: Literal["text", "html"]
    locator: str
    quote: str = Field(min_length=1)
    document_hash: str | None = None


class EvidenceLink(BaseModel):
    text: str = Field(min_length=1)
    url: str = Field(min_length=1)
    references: list[EvidenceReference] = Field(min_length=1)


class IngredientEvidence(BaseModel):
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    locator: str | None = None
    link_url: str | None = None
    references: list[EvidenceReference] = Field(default_factory=list)
    links: list[EvidenceLink] = Field(default_factory=list)


class StepEvidence(BaseModel):
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    locator: str | None = None
    references: list[EvidenceReference] = Field(default_factory=list)


class RecipeComponentEvidence(BaseModel):
    name: str | None = None
    name_references: list[EvidenceReference] = Field(default_factory=list)
    ingredients: list[IngredientEvidence] = Field(default_factory=list)
    steps: list[StepEvidence] = Field(default_factory=list)


class NutritionEvidence(BaseModel):
    """Source-provided per-serving nutrition; values remain source wording."""

    calories: str | None = None
    protein: str | None = None
    fat: str | None = None
    carbohydrates: str | None = None
    raw_text: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    references: list[EvidenceReference] = Field(default_factory=list)


class ExtractedRecipe(BaseModel):
    title: str | None = None
    title_references: list[EvidenceReference] = Field(default_factory=list)
    components: list[RecipeComponentEvidence] = Field(default_factory=list)
    yield_text: str | None = None
    yield_servings: str | None = None
    yield_evidence_ids: list[str] = Field(default_factory=list)
    yield_references: list[EvidenceReference] = Field(default_factory=list)
    total_time_minutes: int | None = None
    total_time_text: str | None = None
    total_time_evidence_ids: list[str] = Field(default_factory=list)
    total_time_references: list[EvidenceReference] = Field(default_factory=list)
    nutrition: NutritionEvidence = Field(default_factory=NutritionEvidence)
    failure_reason: FailureReason | None = None

    @model_validator(mode="after")
    def validate_failure_shape(self) -> ExtractedRecipe:
        model_reasons = {
            FailureReason.NO_RECIPE_CONTENT,
            FailureReason.AMBIGUOUS_RECIPE,
            FailureReason.UNREADABLE_CONTENT,
        }
        for component in self.components:
            if component.name is not None and not component.name.strip():
                raise ValueError("component names cannot be whitespace")
            for fact in [*component.ingredients, *component.steps]:
                if not fact.text.strip():
                    raise ValueError("recipe facts cannot be whitespace")
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
    references = list(recipe.title_references)
    references.extend(recipe.yield_references)
    references.extend(recipe.total_time_references)
    if recipe.nutrition:
        if not set(recipe.nutrition.evidence_ids).issubset(allowed_evidence_ids):
            raise ValueError("nutrition referenced evidence outside its supplied input")
        references.extend(recipe.nutrition.references)
    for component in recipe.components:
        references.extend(component.name_references)
        for fact in [*component.ingredients, *component.steps]:
            if not set(fact.evidence_ids).issubset(allowed_evidence_ids):
                raise ValueError("extractor referenced evidence outside its supplied input")
            references.extend(fact.references)
            if isinstance(fact, IngredientEvidence):
                references.extend(reference for link in fact.links for reference in link.references)
    if any(reference.evidence_id not in allowed_evidence_ids for reference in references):
        raise ValueError("extractor reference is outside its supplied input")
    return recipe


class ExtractionInput(BaseModel):
    """Source-agnostic input. Evidence identifiers are opaque to the extractor."""

    content: str
    evidence_ids: list[str] = Field(default_factory=list)
    spans: list[EvidenceSpan] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_spans(self) -> ExtractionInput:
        if len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("evidence IDs must be unique")
        if not self.evidence_ids and self.spans:
            raise ValueError("spans require evidence IDs")
        if len(self.evidence_ids) > 1 and not self.spans:
            raise ValueError("multiple evidence IDs require spans")
        if len(self.evidence_ids) == 1 and not self.spans:
            self.spans = [EvidenceSpan(evidence_id=self.evidence_ids[0], start=0, end=len(self.content))]
        previous_end = 0
        for span in self.spans:
            if span.evidence_id not in self.evidence_ids:
                raise ValueError("span references an unknown evidence ID")
            if span.end > len(self.content) or span.start >= span.end:
                raise ValueError("span is outside content or empty")
            if span.start < previous_end:
                raise ValueError("spans must be ordered and non-overlapping")
            previous_end = span.end
        if len({span.evidence_id for span in self.spans}) != len(self.spans):
            raise ValueError("each evidence ID may have one span")
        return self


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


class TextSelectionProvider(Protocol):
    async def select(self, source: "TextSelectionInput") -> "TextSelection": ...


class TextLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    text: str = Field(min_length=1)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    evidence_id: str


class TextSelectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str
    lines: list[TextLine]


class NutritionSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_ids: list[str] = Field(default_factory=list)


class ComponentSelection(BaseModel):
    """One explicit component, or the unnamed recipe-wide component."""

    model_config = ConfigDict(extra="forbid")
    heading_id: str | None = None
    ingredient_line_ids: list[str] = Field(default_factory=list)
    instruction_line_ids: list[str] = Field(default_factory=list)


class TextSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    components: list[ComponentSelection] = Field(default_factory=list)
    yield_line_ids: list[str] = Field(default_factory=list)
    nutrition: NutritionSelection = Field(default_factory=NutritionSelection)


class AudioEvidenceExtractor(Protocol):
    async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe: ...


class LanguageDetector(Protocol):
    def detect(self, text: str) -> LanguageResult: ...
