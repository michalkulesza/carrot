"""Evidence normalisation and reference construction for extractor v2."""

from __future__ import annotations

import hashlib
import html
import re

from bs4 import BeautifulSoup, Tag

from api.services.extraction_v2.contracts import EvidenceReference, EvidenceSpan, ExtractionInput


def normalize_evidence_text(value: str) -> str:
    """The sole normalisation used by extraction and reference validation."""

    normalized = re.sub(r"\s+", " ", html.unescape(value)).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", normalized)


def document_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def text_reference(source: ExtractionInput, start: int, end: int, quote: str | None = None) -> EvidenceReference:
    if start < 0 or end > len(source.content) or start >= end:
        raise ValueError("text reference is outside the extraction input")
    evidence_id = _evidence_id_for_range(source.spans, start, end)
    extracted = source.content[start:end]
    return EvidenceReference(
        evidence_id=evidence_id,
        locator_kind="text",
        locator=f"{start}:{end}",
        quote=normalize_evidence_text(quote if quote is not None else extracted),
    )


def html_reference(evidence_id: str, path: str, start: int, end: int, text: str, content: str) -> EvidenceReference:
    if start < 0 or end > len(text) or start >= end:
        raise ValueError("HTML reference is outside node text")
    return EvidenceReference(
        evidence_id=evidence_id,
        locator_kind="html",
        locator=f"{path}:{start}:{end}",
        quote=normalize_evidence_text(text[start:end]),
        document_hash=document_hash(content),
    )


def reference_matches(reference: EvidenceReference, content: str, node_text: str | None = None) -> bool:
    """Validate a reference quotation against the appropriate input text."""

    try:
        if reference.locator_kind == "text":
            start, end = (int(part) for part in reference.locator.split(":"))
            actual = content[start:end]
        else:
            if reference.document_hash != document_hash(content):
                return False
            path, start, end = reference.locator.rsplit(":", 2)
            node_text = node_text if node_text is not None else _html_node_text(content, path)
            if node_text is None:
                return False
            actual = node_text[int(start):int(end)]
    except (TypeError, ValueError):
        return False
    return normalize_evidence_text(actual) == reference.quote


def _evidence_id_for_range(spans: list[EvidenceSpan], start: int, end: int) -> str:
    for span in spans:
        if span.start <= start and end <= span.end:
            return span.evidence_id
    raise ValueError("reference crosses or falls outside evidence spans")


def _html_node_text(content: str, path: str) -> str | None:
    current: Tag = BeautifulSoup(content, "html.parser")
    for part in path.removeprefix("/").split("/"):
        match = re.fullmatch(r"([a-z0-9]+)\[(\d+)]", part)
        if not match:
            return None
        children = current.find_all(match.group(1), recursive=False)
        index = int(match.group(2))
        if index >= len(children):
            return None
        current = children[index]
    return current.get_text(" ", strip=True)
