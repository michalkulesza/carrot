"""Deterministic, source-agnostic recipe evidence extraction."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

from api.services.extraction_v2.contracts import (
    EvidenceLink, EvidenceReference, ExtractedRecipe, ExtractionInput, IngredientEvidence,
    RecipeComponentEvidence, StepEvidence,
)
from api.services.extraction_v2.evidence import html_reference, normalize_evidence_text, text_reference
from api.services.extraction_v2.lexicons import heading_kind, looks_like_ingredient, looks_like_step

MAX_CONTENT_CHARS = 500_000
MAX_BLOCKS = 5_000


@dataclass(frozen=True)
class Block:
    text: str
    kind: str
    heading_level: int | None = None
    start: int | None = None
    end: int | None = None
    path: str | None = None
    links: tuple[tuple[str, str, int, int], ...] = ()
    references: tuple[EvidenceReference, ...] = ()
    link_references: tuple[EvidenceReference, ...] = ()


@dataclass
class _Component:
    name: str | None = None
    name_references: list[EvidenceReference] = field(default_factory=list)
    ingredients: list[IngredientEvidence] = field(default_factory=list)
    steps: list[StepEvidence] = field(default_factory=list)


class RecipeEvidenceExtractor:
    """Extract only grounded wording from cleaned HTML or normalised text."""

    async def extract_html(self, source: ExtractionInput) -> ExtractedRecipe:
        self._validate_input(source)
        blocks, title, title_reference = _html_blocks(source)
        return _extract(blocks, title, title_reference)

    async def extract_text(self, source: ExtractionInput) -> ExtractedRecipe:
        self._validate_input(source)
        blocks = _text_blocks(source)
        return _extract(blocks, None, [])

    @staticmethod
    def _validate_input(source: ExtractionInput) -> None:
        if len(source.content) > MAX_CONTENT_CHARS:
            raise ValueError("extractor input exceeds character limit")


def _extract(blocks: list[Block], title: str | None, title_references: list[EvidenceReference]) -> ExtractedRecipe:
    if len(blocks) > MAX_BLOCKS:
        raise ValueError("extractor input exceeds block limit")
    components: list[_Component] = [_Component()]
    active = components[0]
    section: str | None = None
    section_heading_level: int | None = None
    saw_recipe_clue = False
    for index, block in enumerate(blocks):
        kind = heading_kind(block.text) if block.kind == "heading" else None
        if kind == "stop":
            section = None
            section_heading_level = None
            continue
        if kind:
            section = kind
            section_heading_level = block.heading_level
            saw_recipe_clue = True
            if kind == "instructions" and active.name is not None:
                active = _Component()
                components.append(active)
            continue
        if block.kind == "heading" and section == "ingredients":
            # A non-section heading nested under Ingredients is a component name.
            if (
                block.heading_level is not None
                and section_heading_level is not None
                and block.heading_level <= section_heading_level
                and any(component.ingredients or component.steps for component in components)
            ):
                break
            active = _Component(block.text, _references(block))
            components.append(active)
            continue
        if not block.text or _is_noise(block.text):
            continue
        if section == "ingredients":
            ingredient = IngredientEvidence(
                text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block), links=_links(block),
                link_url=block.links[0][1] if block.links else None,
            )
            active.ingredients.append(ingredient)
            continue
        if section == "instructions":
            active.steps.append(StepEvidence(text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block)))
            continue
        # Heading-free recipes need more than one independent clue. A lone number
        # is never sufficient, preventing nutrition and rating tables becoming facts.
        if looks_like_ingredient(block.text) and _nearby_recipe_clue(blocks, index, "ingredient"):
            active.ingredients.append(IngredientEvidence(
                text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block), links=_links(block),
                link_url=block.links[0][1] if block.links else None,
            ))
            saw_recipe_clue = True
        elif looks_like_step(block.text) and _nearby_recipe_clue(blocks, index, "step"):
            active.steps.append(StepEvidence(text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block)))
            saw_recipe_clue = True
    if not saw_recipe_clue:
        return ExtractedRecipe()
    return ExtractedRecipe(
        title=title,
        title_references=title_references,
        components=[RecipeComponentEvidence(name=item.name, name_references=item.name_references, ingredients=item.ingredients, steps=item.steps)
                    for item in components if item.ingredients or item.steps or item.name],
    )


def _nearby_recipe_clue(blocks: list[Block], index: int, expected: str) -> bool:
    nearby = blocks[max(0, index - 3): min(len(blocks), index + 4)]
    has_other = any(looks_like_step(item.text) if expected == "ingredient" else looks_like_ingredient(item.text) for item in nearby if item is not blocks[index])
    return has_other


def _is_noise(text: str) -> bool:
    normalized = text.casefold()
    return normalized.startswith(("#", "http://", "https://", "advertisement", "sponsored"))


def _ids(block: Block) -> list[str]:
    return list(dict.fromkeys(reference.evidence_id for reference in _references(block)))


def _locator(block: Block) -> str | None:
    references = _references(block)
    return references[0].locator if references else None


def _references(block: Block) -> list[EvidenceReference]:
    return list(block.references)


def _links(block: Block) -> list[EvidenceLink]:
    links: list[EvidenceLink] = []
    for (text, url, _, _), reference in zip(block.links, block.link_references, strict=True):
        links.append(EvidenceLink(text=normalize_evidence_text(text), url=url, references=[reference]))
    return links


def _text_blocks(source: ExtractionInput) -> list[Block]:
    blocks: list[Block] = []
    for match in re.finditer(r"[^\n]+", source.content):
        raw = match.group()
        stripped = raw.strip()
        if not stripped:
            continue
        offset = match.start() + len(raw) - len(raw.lstrip())
        # Support "Ingredients: 1 onion" while leaving commas untouched.
        inline = re.match(r"^([^:]{2,50}):\s+(.+)$", stripped)
        if inline and heading_kind(inline.group(1)):
            heading_end = offset + len(inline.group(1))
            blocks.append(_text_block(source, inline.group(1), "heading", offset, heading_end))
            value_start = offset + inline.start(2)
            blocks.append(_text_block(source, inline.group(2), "item", value_start, value_start + len(inline.group(2))))
            continue
        marker = re.match(r"^(?:[-*•]\s+|\d+[.)]\s+)(.+)$", stripped)
        if marker is None:
            marker = re.match(r"^(?:[-*\u2022]\s+|\d+[.)]\s+)(.+)$", stripped)
        if marker:
            start = offset + marker.start(1)
            blocks.append(_text_block(source, marker.group(1), "item", start, start + len(marker.group(1))))
        elif heading_kind(stripped) or (len(stripped) < 80 and stripped.endswith(":")):
            blocks.append(_text_block(source, stripped.rstrip(":"), "heading", offset, offset + len(stripped.rstrip(":"))))
        else:
            blocks.append(_text_block(source, stripped, "item", offset, offset + len(stripped)))
    return blocks


def _text_block(source: ExtractionInput, text: str, kind: str, start: int, end: int) -> Block:
    reference = text_reference(source, start, end, text)
    return Block(normalize_evidence_text(text), kind, start=start, end=end, references=(reference,))


def _html_blocks(source: ExtractionInput) -> tuple[list[Block], str | None, list[EvidenceReference]]:
    soup = BeautifulSoup(source.content, "html.parser")
    root = soup.body or soup
    blocks: list[Block] = []
    title: str | None = None
    title_references: list[EvidenceReference] = []
    for tag in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "td", "th"]):
        if tag.name == "li" and tag.find("li"):
            # Parent list text would duplicate all nested list items.
            direct_text = " ".join(str(node) for node in tag.contents if isinstance(node, NavigableString)).strip()
            if not direct_text:
                continue
        if tag.find_parent(["script", "style", "nav", "footer", "aside"]):
            continue
        text = normalize_evidence_text(tag.get_text(" ", strip=True))
        if not text:
            continue
        path = _node_path(tag)
        reference = html_reference(source.evidence_ids[0], path, 0, len(tag.get_text(" ", strip=True)), tag.get_text(" ", strip=True), source.content)
        links = []
        link_references = []
        for link in tag.find_all("a", href=True):
            raw_link_text = link.get_text(" ", strip=True)
            link_text = normalize_evidence_text(raw_link_text)
            if link_text:
                links.append((link_text, link["href"], 0, len(link_text)))
                link_references.append(html_reference(source.evidence_ids[0], _node_path(link), 0, len(raw_link_text), raw_link_text, source.content))
        block = Block(text, "heading" if tag.name.startswith("h") else "item", int(tag.name[1]) if tag.name.startswith("h") else None,
                      path=path, links=tuple(links), references=(reference,), link_references=tuple(link_references))
        blocks.append(block)
        if tag.name == "h1" and title is None:
            title, title_references = text, [reference]
    return blocks, title, title_references


def _node_path(tag: Tag) -> str:
    pieces: list[str] = []
    current: Tag | None = tag
    while current is not None and isinstance(current, Tag) and current.name != "[document]":
        siblings = [item for item in current.parent.find_all(current.name, recursive=False)] if current.parent else [current]
        pieces.append(f"{current.name}[{siblings.index(current)}]")
        current = current.parent
    return "/" + "/".join(reversed(pieces))
