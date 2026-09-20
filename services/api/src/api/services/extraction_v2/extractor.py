"""Deterministic, source-agnostic recipe evidence extraction."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

from api.services.extraction_v2.contracts import (
    EvidenceLink, EvidenceReference, ExtractedRecipe, ExtractionInput, IngredientEvidence,
    NutritionEvidence, RecipeComponentEvidence, StepEvidence,
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
        yield_text, yield_references, total_time_minutes, total_time_text, total_time_references, nutrition = _html_metadata(source)
        return _extract(blocks, title, title_reference, allow_unheaded=False, yield_text=yield_text,
                        yield_servings=_yield_servings(yield_text),
                        yield_references=yield_references, total_time_minutes=total_time_minutes,
                        total_time_text=total_time_text, total_time_references=total_time_references, nutrition=nutrition)

    async def extract_text(self, source: ExtractionInput) -> ExtractedRecipe:
        self._validate_input(source)
        blocks = _text_blocks(source)
        return _extract(blocks, None, [], allow_unheaded=True)

    @staticmethod
    def _validate_input(source: ExtractionInput) -> None:
        if len(source.content) > MAX_CONTENT_CHARS:
            raise ValueError("extractor input exceeds character limit")


def _extract(
    blocks: list[Block], title: str | None, title_references: list[EvidenceReference], *, allow_unheaded: bool,
    yield_text: str | None = None, yield_references: list[EvidenceReference] | None = None,
    yield_servings: str | None = None,
    total_time_minutes: int | None = None, total_time_text: str | None = None,
    total_time_references: list[EvidenceReference] | None = None,
    nutrition: NutritionEvidence | None = None,
) -> ExtractedRecipe:
    if len(blocks) > MAX_BLOCKS:
        raise ValueError("extractor input exceeds block limit")
    components: list[_Component] = [_Component()]
    active = components[0]
    section: str | None = None
    section_heading_level: int | None = None
    pending_step_heading: Block | None = None
    pending_step_index: int | None = None
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
            pending_step_heading = None
            pending_step_index = None
            saw_recipe_clue = True
            if kind == "instructions" and active.name is not None:
                active = _Component()
                components.append(active)
            continue
        if (
            block.kind == "heading" and section == "instructions"
            and block.heading_level is not None and section_heading_level is not None
            and block.heading_level <= section_heading_level
        ):
            # A peer/parent heading ends the preparation section.  This keeps
            # page sections such as notes, ratings, and comments out of steps.
            section = None
            section_heading_level = None
            continue
        if section == "instructions" and block.text.casefold() in {"private notes", "notes", "comments", "ratings", "reviews"}:
            section = None
            section_heading_level = None
            continue
        if section == "instructions" and block.kind == "heading" and re.match(r"^step\s*\d+\s*[:.)-]", block.text, re.IGNORECASE):
            pending_step_heading = block
            pending_step_index = None
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
            if _is_component_label(block):
                active = _Component(block.text.rstrip(":"), _references(block))
                components.append(active)
                continue
            ingredient = IngredientEvidence(
                text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block), links=_links(block),
                link_url=block.links[0][1] if block.links else None,
            )
            active.ingredients.append(ingredient)
            continue
        if section == "instructions":
            if pending_step_heading is not None:
                if pending_step_index is None:
                    active.steps.append(StepEvidence(
                        text=f"{pending_step_heading.text} — {block.text}",
                        evidence_ids=list(dict.fromkeys([*_ids(pending_step_heading), *_ids(block)])),
                        locator=_locator(block), references=[*_references(pending_step_heading), *_references(block)],
                    ))
                    pending_step_index = len(active.steps) - 1
                else:
                    step = active.steps[pending_step_index]
                    step.text = f"{step.text}\n\n{block.text}"
                    step.evidence_ids = list(dict.fromkeys([*step.evidence_ids, *_ids(block)]))
                    step.references.extend(_references(block))
            else:
                active.steps.append(StepEvidence(text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block)))
            continue
        # Heading-free recipes need more than one independent clue. A lone number
        # is never sufficient, preventing nutrition and rating tables becoming facts.
        if allow_unheaded and looks_like_ingredient(block.text) and _nearby_recipe_clue(blocks, index, "ingredient"):
            active.ingredients.append(IngredientEvidence(
                text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block), links=_links(block),
                link_url=block.links[0][1] if block.links else None,
            ))
            saw_recipe_clue = True
        elif allow_unheaded and looks_like_step(block.text) and _nearby_recipe_clue(blocks, index, "step"):
            active.steps.append(StepEvidence(text=block.text, evidence_ids=_ids(block), locator=_locator(block), references=_references(block)))
            saw_recipe_clue = True
    if not saw_recipe_clue:
        return ExtractedRecipe(
            title=title, title_references=title_references, yield_text=yield_text, yield_servings=yield_servings,
            yield_evidence_ids=_reference_ids(yield_references or []), yield_references=yield_references or [],
            total_time_minutes=total_time_minutes, total_time_text=total_time_text,
            total_time_evidence_ids=_reference_ids(total_time_references or []),
            total_time_references=total_time_references or [], nutrition=nutrition,
        )
    return ExtractedRecipe(
        title=title,
        title_references=title_references,
        components=[RecipeComponentEvidence(name=item.name, name_references=item.name_references, ingredients=item.ingredients, steps=item.steps)
                    for item in components if item.ingredients or item.steps or item.name],
        yield_text=yield_text,
        yield_servings=yield_servings,
        yield_evidence_ids=_reference_ids(yield_references or []),
        yield_references=yield_references or [],
        total_time_minutes=total_time_minutes,
        total_time_text=total_time_text,
        total_time_evidence_ids=_reference_ids(total_time_references or []),
        total_time_references=total_time_references or [],
        nutrition=nutrition,
    )


def _nearby_recipe_clue(blocks: list[Block], index: int, expected: str) -> bool:
    nearby = blocks[max(0, index - 3): min(len(blocks), index + 4)]
    has_other = any(looks_like_step(item.text) if expected == "ingredient" else looks_like_ingredient(item.text) for item in nearby if item is not blocks[index])
    return has_other


def _is_noise(text: str) -> bool:
    normalized = text.casefold()
    return normalized.startswith(("#", "http://", "https://", "advertisement", "sponsored"))


def _is_component_label(block: Block) -> bool:
    return block.kind == "item" and block.text.endswith(":") and len(block.text) <= 80 and not re.search(r"\d", block.text)


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
    for tag in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "strong", "td", "th"]):
        if tag.name == "li" and tag.find(["p", "li"]):
            # The descendant paragraph/list item is the atomic recipe fact.
            continue
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
        if tag.name == "strong" and not text.endswith(":"):
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
        if tag.name == "h1":
            title, title_references = text, [reference]
        elif tag.name == "h2" and title is None and heading_kind(text) is None:
            title, title_references = text, [reference]
    return blocks, title, title_references


TOTAL_TIME_LABEL = re.compile(
    r"\b(?:total\s+time|czas\s+(?:całkowity|calkowity)|gesamt(?:zeit|dauer)|temps\s+total|tiempo\s+total)\b",
    re.IGNORECASE,
)
TIME_AMOUNT = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|godzin(?:a|y|ę|e)?|stund(?:e|en)|heures?|horas?|"
    r"minutes?|mins?|min|m|minut(?:[a-ząćęłńóśźż]+)?)\b",
    re.IGNORECASE,
)


def _html_metadata(source: ExtractionInput) -> tuple[str | None, list[EvidenceReference], int | None, str | None, list[EvidenceReference], NutritionEvidence | None]:
    """Read explicitly labelled source metadata without treating it as a recipe item."""

    soup = BeautifulSoup(source.content, "html.parser")
    root = soup.body or soup
    structured = _jsonld_recipe_metadata(source, root)
    yield_text: str | None = None
    yield_references: list[EvidenceReference] = []
    total_time_minutes: int | None = None
    total_time_text: str | None = None
    total_time_references: list[EvidenceReference] = []
    nutrition: NutritionEvidence | None = None
    for control in root.find_all(["input", "span"]):
        classes = " ".join(control.get("class", ())).casefold()
        aria_label = (control.get("aria-label") or "").casefold()
        value = (control.get("value") or control.get_text(" ", strip=True)).strip()
        if (
            ("recipe-servings" in classes or "adjust recipe servings" in aria_label)
            and re.fullmatch(r"\d+(?:[.,]\d+)?", value)
        ):
            yield_text = value
            yield_references = [_metadata_reference(source, control, str(control))]
            break
    for tag in root.find_all(["div", "p", "li", "h3", "h4", "h5", "h6"]):
        raw = tag.get_text(" ", strip=True)
        normalized = normalize_evidence_text(raw)
        if yield_text is None and (normalized.casefold().startswith("yield:") or re.match(r"^serv(?:es|ings?)\b", normalized, re.IGNORECASE)):
            candidate = normalized.split(":", 1)[1].strip() if ":" in normalized else re.sub(r"^serv(?:es|ings?)\s*", "", normalized, flags=re.IGNORECASE)
            candidate = re.split(r"\b(?:prep|cook|total)\s+time\b", candidate, maxsplit=1, flags=re.IGNORECASE)[0].strip()
            if candidate:
                yield_text = candidate
                yield_references = [_metadata_reference(source, tag, raw)]
        if total_time_minutes is None:
            label = TOTAL_TIME_LABEL.search(normalized)
            if label:
                candidate = normalized[label.end():].strip(" :–-")
                duration = _total_time_parts(candidate)
                if duration is not None:
                    total_time_minutes, total_time_text = duration
                    total_time_references = [_metadata_reference(source, tag, raw)]
        if nutrition is None and normalized.casefold().startswith(("nutritional analysis", "nutrition facts", "nutrition")):
            detail = tag if "calor" in normalized.casefold() else tag.find_next_sibling()
            if detail is None or "calor" not in detail.get_text(" ", strip=True).casefold():
                detail = tag.find_next("p")
            if detail is None:
                continue
            detail_raw = detail.get_text(" ", strip=True)
            detail_text = normalize_evidence_text(detail_raw)
            nutrition = NutritionEvidence(
                raw_text=detail_text,
                calories=_nutrition_value(detail_text, r"[^;]*?\bcalories?\b"),
                protein=_nutrition_value(detail_text, r"[^;]*?\bprotein\b"),
                fat=_nutrition_value(detail_text, r"[^;]*?\bfat\b", exclude=("monounsaturated", "polyunsaturated", "saturated")),
                carbohydrates=_nutrition_value(detail_text, r"[^;]*?\b(?:carbs?|carbohydrates?)\b"),
                evidence_ids=[source.evidence_ids[0]], references=[_metadata_reference(source, detail, detail_raw)],
            )
    if yield_text is None:
        yield_text, yield_references = structured["yield_text"], structured["yield_references"]
    if total_time_minutes is None:
        total_time_minutes = structured["total_time_minutes"]
        total_time_text = structured["total_time_text"]
        total_time_references = structured["total_time_references"]
    return yield_text, yield_references, total_time_minutes, total_time_text, total_time_references, nutrition or structured["nutrition"]


def _jsonld_recipe_metadata(source: ExtractionInput, root: Tag) -> dict[str, object]:
    result: dict[str, object] = {
        "yield_text": None, "yield_references": [], "total_time_minutes": None, "total_time_text": None,
        "total_time_references": [], "nutrition": None,
    }
    for script in root.find_all("script", type="application/ld+json"):
        try:
            payload = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue
        for item in _jsonld_items(payload):
            types = item.get("@type", [])
            if isinstance(types, str):
                types = [types]
            if not any(str(kind).casefold() == "recipe" for kind in types):
                continue
            raw = script.string or ""
            reference = _metadata_reference(source, script, raw)
            recipe_yield = item.get("recipeYield")
            if isinstance(recipe_yield, list):
                recipe_yield = next((value for value in recipe_yield if isinstance(value, str) and value.strip()), None)
            if isinstance(recipe_yield, str) and recipe_yield.strip():
                result["yield_text"] = normalize_evidence_text(recipe_yield)
                result["yield_references"] = [reference]
            total_time = item.get("totalTime")
            if isinstance(total_time, str) and (minutes := _iso8601_duration_minutes(total_time)) is not None:
                result["total_time_minutes"] = minutes
                result["total_time_text"] = total_time
                result["total_time_references"] = [reference]
            nutrition = item.get("nutrition")
            if isinstance(nutrition, dict):
                raw_nutrition = json.dumps(nutrition, ensure_ascii=False)
                result["nutrition"] = NutritionEvidence(
                    raw_text=raw_nutrition,
                    calories=_number_from_value(nutrition.get("calories")),
                    protein=_number_from_value(nutrition.get("proteinContent")),
                    fat=_number_from_value(nutrition.get("fatContent")),
                    carbohydrates=_number_from_value(nutrition.get("carbohydrateContent")),
                    evidence_ids=[source.evidence_ids[0]], references=[reference],
                )
            return result
    return result


def _jsonld_items(payload: object) -> list[dict[str, object]]:
    if isinstance(payload, dict):
        graph = payload.get("@graph")
        return [item for item in graph if isinstance(item, dict)] if isinstance(graph, list) else [payload]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def _number_from_value(value: object) -> str | None:
    match = re.search(r"\d+(?:[.,]\d+)?", str(value)) if value is not None else None
    return match.group() if match else None


def _iso8601_duration_minutes(value: str) -> int | None:
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?", value, re.IGNORECASE)
    return int(match.group(1) or 0) * 60 + int(match.group(2) or 0) if match else None


def _total_time_minutes(value: str) -> int | None:
    duration = _total_time_parts(value)
    return duration[0] if duration else None


def _total_time_parts(value: str) -> tuple[int, str] | None:
    matches = list(TIME_AMOUNT.finditer(value))
    if not matches:
        return None
    selected = [matches[0]]
    for match in matches[1:]:
        separator = value[selected[-1].end():match.start()]
        # A total time may repeat its unit in adjacent display spans ("1 hour hour 5 minutes").
        # Stop at prose so preparation and instruction durations are never added to total time.
        if not re.fullmatch(r"\s*(?:,|and|i|et|y)?\s*(?:[a-ząćęłńóśźż]+)?\s*", separator, re.IGNORECASE):
            break
        selected.append(match)

    total = 0.0
    for match in selected:
        amount, unit = match.groups()
        multiplier = 60 if unit.casefold().startswith(("h", "godzin", "stund", "heure", "hora")) else 1
        total += float(amount.replace(",", ".")) * multiplier
    return (round(total), value[selected[0].start():selected[-1].end()]) if total else None


def _metadata_reference(source: ExtractionInput, tag: Tag, raw: str) -> EvidenceReference:
    return html_reference(source.evidence_ids[0], _node_path(tag), 0, len(raw), raw, source.content)


def _nutrition_value(text: str, pattern: str, *, exclude: tuple[str, ...] = ()) -> str | None:
    for value in re.split(r"[;,|]", text):
        if re.search(pattern, value, re.IGNORECASE) and not any(word in value.casefold() for word in exclude):
            amount = re.search(r"\d+(?:[.,]\d+)?", value)
            return amount.group() if amount else None
    return None


def _yield_servings(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*\d+(?:[.,]\d+)?)?\s+(?:servings?|rolls?)\b", value, re.IGNORECASE)
    if match:
        return match.group(1)
    leading_count = re.match(r"\s*(\d+(?:[.,]\d+)?)\b", value)
    return leading_count.group(1) if leading_count else None


def _reference_ids(references: list[EvidenceReference]) -> list[str]:
    return list(dict.fromkeys(reference.evidence_id for reference in references))


def _node_path(tag: Tag) -> str:
    pieces: list[str] = []
    current: Tag | None = tag
    while current is not None and isinstance(current, Tag) and current.name != "[document]":
        siblings = [item for item in current.parent.find_all(current.name, recursive=False)] if current.parent else [current]
        pieces.append(f"{current.name}[{siblings.index(current)}]")
        current = current.parent
    return "/" + "/".join(reversed(pieces))
