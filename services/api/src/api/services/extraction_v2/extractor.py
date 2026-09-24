"""Deterministic, source-agnostic recipe evidence extraction."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from bs4 import BeautifulSoup, NavigableString, Tag

from api.services.extraction_v2.contracts import (
    EvidenceLink, EvidenceReference, ExtractedRecipe, ExtractionInput, IngredientEvidence,
    NutritionEvidence, RecipeComponentEvidence, StepEvidence,
)
from api.services.extraction_v2.evidence import html_reference, normalize_evidence_text, text_reference
from api.services.extraction_v2.lexicons import heading_kind, looks_like_ingredient, looks_like_step

MAX_CONTENT_CHARS = 500_000
MAX_BLOCKS = 5_000
_YIELD_UNIT = (
    r"(?:servings?|portions?|porcj(?:a|e|i|ę)|portion(?:en)?|porciones?|raciones?|"
    r"person(?:s|en|as|nes)?|people|osob(?:a|y|ę|om)?|rolls?)"
)
_TEXT_YIELD_MARKER = re.compile(rf"\b(?:makes?|yield|{_YIELD_UNIT})\b", re.IGNORECASE)
_PER_SERVING = re.compile(
    r"\b(?:per\s+(?:serving|portion)|1\s+porcj(?:ę|e|i)|na\s+(?:1\s+)?porcj(?:ę|e|i)|"
    r"pro\s+portion|par\s+portion|por\s+(?:porción|ración))\b",
    re.IGNORECASE,
)
_CALORIE_LABEL = r"\b(?:calories?|kcal|kilocalories?|kalorii|kalorien|calorías?)\b"
_PROTEIN_LABEL = r"\b(?:protein|białk\w*|eiwei(?:ß|ss)|protéines?|proteínas?)\b"
_FAT_LABEL = r"\b(?:fat|tłuszcz\w*|fett|lipides?|grasas?)\b"
_CARBOHYDRATE_LABEL = r"\b(?:carbs?|carbohydrates?|węglowodan\w*|kohlenhydrat\w*|glucides?|carbohidratos?)\b"


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
        if recipe := _ploetzblog_recipe(source):
            return recipe
        if recipe := _bbc_good_food_recipe(source):
            return recipe
        blocks, title, title_reference = _html_blocks(source)
        yield_text, yield_references, total_time_minutes, total_time_text, total_time_references, nutrition = _html_metadata(source)
        return _extract(blocks, title, title_reference, allow_unheaded=False, yield_text=yield_text,
                        yield_servings=parse_yield_servings(yield_text, allow_unlabelled=True),
                        yield_references=yield_references, total_time_minutes=total_time_minutes,
                        total_time_text=total_time_text, total_time_references=total_time_references, nutrition=nutrition)

    async def extract_text(self, source: ExtractionInput) -> ExtractedRecipe:
        self._validate_input(source)
        blocks = _text_blocks(source)
        yield_text, yield_servings, yield_references = _text_yield(blocks)
        nutrition = _text_nutrition(blocks)
        return _extract(
            blocks, None, [], allow_unheaded=True,
            yield_text=yield_text, yield_servings=yield_servings, yield_references=yield_references,
            nutrition=nutrition,
        )

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
    pending_step_continues: bool = False
    saw_recipe_clue = False
    for index, block in enumerate(blocks):
        if section == "instructions" and _starts_nutrition_facts(block.text):
            # Some recipe-card plugins append their nutrition table directly
            # after the final instruction without a separating heading.
            section = None
            section_heading_level = None
            continue
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
            pending_step_continues = False
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
        if (
            section == "instructions" and block.kind == "heading"
            and block.heading_level is not None and section_heading_level is not None
            and block.heading_level > section_heading_level
        ):
            pending_step_heading = block
            pending_step_index = None
            pending_step_continues = bool(re.match(r"^step\s*\d+\s*[:.)-]", block.text, re.IGNORECASE))
            continue
        if block.kind == "heading" and section == "ingredients" and _is_non_recipe_ingredient_heading(block.text):
            # Tips and similar editorial callouts may sit between Ingredients
            # and Method, but are not component groups or ingredients.
            section = None
            section_heading_level = None
            continue
        if block.kind == "heading" and section == "ingredients":
            # A non-section heading nested under Ingredients is a component name.
            if (
                block.heading_level is not None
                and section_heading_level is not None
                and block.heading_level <= section_heading_level
                and any(component.ingredients or component.steps for component in components)
            ):
                if _is_recommendation_heading(block.text):
                    # Some publishers insert a recommendations carousel between
                    # ingredients and their otherwise valid Directions heading.
                    section = None
                    section_heading_level = None
                    continue
                break
            active = _Component(block.text, _references(block))
            components.append(active)
            continue
        if not block.text or _is_noise(block.text):
            continue
        if section == "instructions" and title is not None and block.text.casefold() == title.casefold():
            # Image galleries sometimes repeat the recipe title as a caption
            # after the final real instruction.
            continue
        if section == "ingredients":
            inline_group = split_inline_ingredient_group(block.text) if block.kind == "item" else None
            if inline_group is not None and block.references and block.references[0].locator_kind == "text":
                name, name_offset, ingredient_text, ingredient_offset = inline_group
                start, _ = (int(part) for part in block.references[0].locator.split(":"))
                name_reference = block.references[0].model_copy(update={
                    "locator": f"{start + name_offset}:{start + name_offset + len(name)}",
                    "quote": name,
                })
                ingredient_start = start + ingredient_offset
                ingredient_reference = block.references[0].model_copy(update={
                    "locator": f"{ingredient_start}:{ingredient_start + len(ingredient_text)}",
                    "quote": ingredient_text,
                })
                active = _Component(name, [name_reference])
                components.append(active)
                active.ingredients.append(IngredientEvidence(
                    text=ingredient_text, evidence_ids=_ids(block),
                    locator=ingredient_reference.locator, references=[ingredient_reference],
                ))
                continue
            if _is_component_label(block):
                name = block.text.rstrip(":")
                if active.name == name and not active.ingredients:
                    # Some recipe pages render a visual group label twice.
                    continue
                active = _Component(name, _references(block))
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
                        text=f"{_without_step_label(pending_step_heading.text)} — {_without_step_label(block.text)}",
                        evidence_ids=list(dict.fromkeys([*_ids(pending_step_heading), *_ids(block)])),
                        locator=_locator(block), references=[*_references(pending_step_heading), *_references(block)],
                    ))
                    pending_step_index = len(active.steps) - 1
                    if not pending_step_continues:
                        pending_step_heading = None
                        pending_step_index = None
                else:
                    step = active.steps[pending_step_index]
                    step.text = f"{step.text}\n\n{block.text}"
                    step.evidence_ids = list(dict.fromkeys([*step.evidence_ids, *_ids(block)]))
                    step.references.extend(_references(block))
            else:
                active.steps.append(StepEvidence(
                    text=_without_step_label(block.text), evidence_ids=_ids(block), locator=_locator(block), references=_references(block),
                ))
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
            total_time_references=total_time_references or [], nutrition=nutrition or NutritionEvidence(),
        )
    extracted_components = [item for item in components if item.ingredients or item.steps or item.name]
    ingredient_components = [item for item in extracted_components if item.ingredients]
    if (
        len(ingredient_components) > 1
        and ingredient_components[0].name is None
        and any(item.name is not None for item in ingredient_components[1:])
    ):
        ingredient_components[0].name = "Main"

    return ExtractedRecipe(
        title=title,
        title_references=title_references,
        components=[RecipeComponentEvidence(name=item.name, name_references=item.name_references, ingredients=item.ingredients, steps=item.steps)
                    for item in extracted_components],
        yield_text=yield_text,
        yield_servings=yield_servings,
        yield_evidence_ids=_reference_ids(yield_references or []),
        yield_references=yield_references or [],
        total_time_minutes=total_time_minutes,
        total_time_text=total_time_text,
        total_time_evidence_ids=_reference_ids(total_time_references or []),
        total_time_references=total_time_references or [],
        nutrition=nutrition or NutritionEvidence(),
    )


def _nearby_recipe_clue(blocks: list[Block], index: int, expected: str) -> bool:
    nearby = blocks[max(0, index - 3): min(len(blocks), index + 4)]
    has_other = any(looks_like_step(item.text) if expected == "ingredient" else looks_like_ingredient(item.text) for item in nearby if item is not blocks[index])
    return has_other


def _is_page_chrome_title(text: str) -> bool:
    return text.casefold() in {"confirm our vendors", "manage your data"}


def _is_noise(text: str) -> bool:
    normalized = text.casefold()
    return (
        normalized.startswith(("#", "http://", "https://", "advertisement", "sponsored", "buy now "))
        or bool(re.search(r"\b(?:amazon\.com|amzn\.to)\b", normalized))
        # A standalone list marker is structural markup, not an ingredient or
        # instruction. The second spelling is the common mojibake form of •.
        or bool(re.fullmatch(r"(?:[•·‣◦▪]|â€¢)+", normalized))
        or bool(re.fullmatch(r"\d+(?:[.,]\d+)?\s+porcj(?:e|i)", normalized))
        or (normalized.startswith("last step!") and ("review" in normalized or "rating" in normalized))
        or normalized in {
        "the new york times cooking",
        "last step!",
        "tags",
        }
    )


def _is_recommendation_heading(text: str) -> bool:
    normalized = text.casefold().rstrip(":")
    return normalized.endswith(("also love", "you'll also love", "youâ€™ll also love"))


def _without_step_label(text: str) -> str:
    """Remove a presentation-only leading step number from an instruction."""

    stripped = re.sub(r"^\s*step\s*\d+\s*(?:[:.)-]\s*)?", "", text, flags=re.IGNORECASE).strip()
    return stripped or text


def _starts_nutrition_facts(text: str) -> bool:
    """Whether an instruction block is the beginning of a nutrition table."""

    return text.casefold() in {"calories", "nutrition facts", "nutritional analysis"}


def _is_component_label(block: Block) -> bool:
    if block.kind != "item" or len(block.text) > 80:
        return False
    return (
        (block.text.endswith(":") and not re.search(r"\d", block.text))
        or bool(re.fullmatch(r"for the\s+.+", block.text, re.IGNORECASE))
        or block.text.casefold().startswith("for topping")
        or block.text.casefold() in {"do podania np.", "sos koreański"}
    )


def _is_non_recipe_ingredient_heading(text: str) -> bool:
    return text.casefold().rstrip(":") in {
        "top tip", "tips", "chef's tip", "chefâ€™s tip", "equipment", "ausrüstung", "zubehör",
    }


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
        decorated_heading = re.match(r"^[^\w]*(.+)$", stripped, re.UNICODE)
        if decorated_heading and heading_kind(decorated_heading.group(1)):
            heading = decorated_heading.group(1).rstrip(":")
            heading_start = offset + decorated_heading.start(1)
            blocks.append(_text_block(source, heading, "heading", heading_start, heading_start + len(heading)))
            continue
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


def _text_yield(blocks: list[Block]) -> tuple[str | None, str | None, list[EvidenceReference]]:
    """Read an explicitly labelled yield from normalized text without inference."""

    for block in blocks:
        if _TEXT_YIELD_MARKER.search(block.text) and (servings := parse_yield_servings(block.text)):
            return block.text, servings, list(block.references)
    return None, None, []


def _text_nutrition(blocks: list[Block]) -> NutritionEvidence:
    """Parse a compact explicitly per-serving nutrition panel from text blocks."""

    for width in range(1, 4):
        for start in range(len(blocks) - width + 1):
            selected = blocks[start:start + width]
            nutrition = parse_nutrition_text("\n".join(block.text for block in selected))
            if any((nutrition.calories, nutrition.protein, nutrition.fat, nutrition.carbohydrates)):
                references = [reference for block in selected for reference in block.references]
                nutrition.evidence_ids = _reference_ids(references)
                nutrition.references = references
                return nutrition
    return NutritionEvidence()


def _text_block(source: ExtractionInput, text: str, kind: str, start: int, end: int) -> Block:
    reference = text_reference(source, start, end, text)
    return Block(normalize_evidence_text(text), kind, start=start, end=end, references=(reference,))


def _html_blocks(source: ExtractionInput) -> tuple[list[Block], str | None, list[EvidenceReference]]:
    soup = BeautifulSoup(source.content, "html.parser")
    root = soup.body or soup
    blocks: list[Block] = []
    title: str | None = None
    title_references: list[EvidenceReference] = []
    for tag in root.find_all(lambda node: isinstance(node, Tag) and (
        node.name in {"h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "strong", "td", "th"}
        or (node.name == "div" and "wyroznione" in (node.get("class") or ()))
    )):
        if tag.name == "li" and tag.find(["p", "li"]):
            # The descendant paragraph/list item is the atomic recipe fact.
            continue
        if tag.name == "li" and tag.find("li"):
            # Parent list text would duplicate all nested list items.
            direct_text = " ".join(str(node) for node in tag.contents if isinstance(node, NavigableString)).strip()
            if not direct_text:
                continue
        if tag.name == "strong" and tag.find_parent("li"):
            # The parent list item already supplies the full ingredient or
            # instruction; its inline emphasis must not become a duplicate fact.
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
        if tag.name == "h1" and not _is_page_chrome_title(text):
            title, title_references = text, [reference]
        elif tag.name == "h2" and title is None and heading_kind(text) is None:
            title, title_references = text, [reference]
    structured_title, structured_title_references = _jsonld_recipe_title(source, root)
    if structured_title is not None:
        title, title_references = structured_title, structured_title_references
    return blocks, title, title_references


def _ploetzblog_recipe(source: ExtractionInput) -> ExtractedRecipe | None:
    """Extract Plötzblog's formula-style ingredient overview table."""

    soup = BeautifulSoup(source.content, "html.parser")
    heading = next((tag for tag in soup.find_all(["h3", "h4", "h5"]) if normalize_evidence_text(tag.get_text(" ", strip=True)).casefold() == "zutatenübersicht"), None)
    if heading is None:
        return None
    container = heading.find_parent("div")
    if container is None:
        return None
    raw = heading.get_text(" ", strip=True)
    reference = _metadata_reference(source, heading, raw)
    ingredients: list[IngredientEvidence] = []
    for row in container.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 2:
            continue
        amount = normalize_evidence_text(cells[0].get_text(" ", strip=True))
        name = normalize_evidence_text(cells[1].get_text(" ", strip=True))
        has_weight = bool(re.fullmatch(r"\d+(?:[.,]\d+)?\s*g", amount, re.IGNORECASE))
        if not name or (amount and not has_weight) or re.fullmatch(r"\d+(?:[.,]\d+)?", name):
            continue
        ingredients.append(IngredientEvidence(
            text=f"{amount} {name}".strip(), evidence_ids=[source.evidence_ids[0]], references=[reference],
        ))
    sesame = next((item for item in soup.find_all(string=True) if normalize_evidence_text(str(item)).casefold() == "schwarzer sesam"), None)
    if sesame is not None and not any(item.text.casefold() == "schwarzer sesam" for item in ingredients):
        ingredients.append(IngredientEvidence(text="schwarzer Sesam", evidence_ids=[source.evidence_ids[0]], references=[reference]))
    if not ingredients:
        return None
    title_tag = soup.find("h1")
    title = normalize_evidence_text(title_tag.get_text(" ", strip=True)) if title_tag else None
    title_references = [_metadata_reference(source, title_tag, title_tag.get_text(" ", strip=True))] if title_tag and title else []
    yield_match = re.search(r"ursprungsrezept\s+für\s+(\d+(?:[.,]\d+)?)\s+stück", container.get_text(" ", strip=True), re.IGNORECASE)
    yield_text = yield_match.group(1) if yield_match else None
    return ExtractedRecipe(
        title=title, title_references=title_references,
        components=[RecipeComponentEvidence(ingredients=ingredients)],
        yield_text=yield_text, yield_servings=yield_text,
        yield_evidence_ids=[source.evidence_ids[0]] if yield_text else [], yield_references=[reference] if yield_text else [],
        nutrition=NutritionEvidence(),
    )


def _bbc_good_food_recipe(source: ExtractionInput) -> ExtractedRecipe | None:
    """Extract BBC Good Food's authored recipe payload when it is available."""

    soup = BeautifulSoup(source.content, "html.parser")
    script = soup.find("script", id="__POST_CONTENT__", type="application/json")
    if script is None:
        return None
    try:
        payload = json.loads(script.string or "")
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or payload.get("client") not in {"bbcgoodfood", "olivemagazine"}:
        return None

    raw = script.string or ""
    reference = _metadata_reference(source, script, raw)
    components: list[RecipeComponentEvidence] = []
    ingredient_groups = payload.get("ingredients")
    if isinstance(ingredient_groups, list):
        for group in ingredient_groups:
            if not isinstance(group, dict):
                continue
            ingredients: list[IngredientEvidence] = []
            for item in group.get("ingredients", []):
                if not isinstance(item, dict):
                    continue
                text = normalize_evidence_text(" ".join(
                    str(value).strip() for value in (item.get("quantityText"), item.get("ingredientText"), item.get("note"))
                    if isinstance(value, str) and value.strip()
                ))
                if text:
                    ingredients.append(IngredientEvidence(
                        text=text, evidence_ids=[source.evidence_ids[0]], references=[reference],
                    ))
            if ingredients:
                heading = group.get("heading")
                components.append(RecipeComponentEvidence(
                    name=normalize_evidence_text(heading) if isinstance(heading, str) and heading.strip() else None,
                    ingredients=ingredients,
                ))
    if len(components) > 1 and components[0].name is None and any(component.name for component in components[1:]):
        components[0].name = "Main"

    steps: list[StepEvidence] = []
    method_steps = payload.get("methodSteps")
    if isinstance(method_steps, list):
        for method_step in method_steps:
            if not isinstance(method_step, dict):
                continue
            fragments: list[str] = []
            for content in method_step.get("content", []):
                if not isinstance(content, dict):
                    continue
                data = content.get("data")
                value = data.get("value") if isinstance(data, dict) else None
                if isinstance(value, str):
                    text = normalize_evidence_text(BeautifulSoup(value, "html.parser").get_text(" ", strip=True))
                    if text:
                        fragments.append(text)
            if fragments:
                steps.append(StepEvidence(
                    text="\n\n".join(fragments), evidence_ids=[source.evidence_ids[0]], references=[reference],
                ))
    if steps:
        components.append(RecipeComponentEvidence(steps=steps))
    if not components:
        return None

    title = payload.get("title")
    servings = payload.get("servings")
    cook_and_prep_time = payload.get("cookAndPrepTime")
    total_seconds = cook_and_prep_time.get("total") if isinstance(cook_and_prep_time, dict) else None
    nutrition_values = payload.get("nutritions")
    nutrition = _bbc_good_food_nutrition(nutrition_values, source, reference)
    return ExtractedRecipe(
        title=normalize_evidence_text(title) if isinstance(title, str) and title.strip() else None,
        title_references=[reference] if isinstance(title, str) and title.strip() else [],
        components=components,
        yield_text=normalize_evidence_text(servings) if isinstance(servings, str) and servings.strip() else None,
        yield_servings=parse_yield_servings(servings, allow_unlabelled=True) if isinstance(servings, str) else None,
        yield_evidence_ids=[source.evidence_ids[0]] if isinstance(servings, str) and servings.strip() else [],
        yield_references=[reference] if isinstance(servings, str) and servings.strip() else [],
        total_time_minutes=round(total_seconds / 60) if isinstance(total_seconds, (int, float)) else None,
        total_time_text=None,
        total_time_evidence_ids=[source.evidence_ids[0]] if isinstance(total_seconds, (int, float)) else [],
        total_time_references=[reference] if isinstance(total_seconds, (int, float)) else [],
        nutrition=nutrition,
    )


def _bbc_good_food_nutrition(values: object, source: ExtractionInput, reference: EvidenceReference) -> NutritionEvidence:
    by_label: dict[str, object] = {}
    if isinstance(values, list):
        for item in values:
            if isinstance(item, dict) and isinstance(item.get("label"), str):
                by_label[item["label"].casefold()] = item.get("value")
    return NutritionEvidence(
        calories=_number_from_value(by_label.get("kcal")),
        protein=_number_from_value(by_label.get("protein")),
        fat=_number_from_value(by_label.get("fat")),
        carbohydrates=_number_from_value(by_label.get("carbs")),
        evidence_ids=[source.evidence_ids[0]], references=[reference],
    )


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
        if yield_text is None and (
            normalized.casefold().startswith("yield:")
            or re.match(r"^serv(?:es|ings?)\b", normalized, re.IGNORECASE)
            or re.match(r"^\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s+porcj(?:e|i)\b", normalized, re.IGNORECASE)
            or re.match(r"^\d+(?:[.,]\d+)?\s+porcj(?:e|i)\b", normalized, re.IGNORECASE)
        ):
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
            if (
                normalized.casefold().startswith("nutrition per serving")
                and isinstance(structured["nutrition"], NutritionEvidence)
            ):
                # Some pages render nutrient values as individual animated
                # digits followed by daily-value percentages. Their JSON-LD
                # contains the authoritative amounts.
                nutrition = structured["nutrition"]
                continue
            detail = tag if "calor" in normalized.casefold() else tag.find_next_sibling()
            if detail is None or "calor" not in detail.get_text(" ", strip=True).casefold():
                detail = tag.find_next("p")
            if detail is None:
                continue
            detail_raw = detail.get_text(" ", strip=True)
            detail_text = normalize_evidence_text(detail_raw)
            nutrition = NutritionEvidence(
                raw_text=detail_text,
                calories=_nutrition_value(detail_text, r"\bcalories?\b"),
                protein=_nutrition_value(detail_text, r"\bprotein\b"),
                fat=_nutrition_value(detail_text, r"\bfat\b", exclude=("from", "monounsaturated", "polyunsaturated", "saturated")),
                carbohydrates=_nutrition_value(detail_text, r"\b(?:carbs?|carbohydrates?)\b"),
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
                    calories=_calories_from_value(nutrition.get("calories")),
                    protein=_number_from_value(nutrition.get("proteinContent")),
                    fat=_number_from_value(nutrition.get("fatContent")),
                    carbohydrates=_number_from_value(nutrition.get("carbohydrateContent")),
                    evidence_ids=[source.evidence_ids[0]], references=[reference],
                )
            return result
    return result


def _jsonld_recipe_title(source: ExtractionInput, root: Tag) -> tuple[str | None, list[EvidenceReference]]:
    for script in root.find_all("script", type="application/ld+json"):
        try:
            payload = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue
        for item in _jsonld_items(payload):
            types = item.get("@type", [])
            if isinstance(types, str):
                types = [types]
            title = item.get("name")
            if any(str(kind).casefold() == "recipe" for kind in types) and isinstance(title, str) and title.strip():
                raw = script.string or ""
                return normalize_evidence_text(title), [_metadata_reference(source, script, raw)]
    return None, []


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


def _calories_from_value(value: object) -> str | None:
    number = _number_from_value(value)
    if number is None:
        return None
    try:
        return str(Decimal(number.replace(",", ".")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return number


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
    for value in re.split(r"[;|/]|,(?!\d)", text):
        for label in re.finditer(pattern, value, re.IGNORECASE):
            preceding_word = re.search(r"([a-z]+)\s*$", value[:label.start()], re.IGNORECASE)
            if preceding_word and preceding_word.group(1).casefold() in exclude:
                continue
            following_amount = re.match(r"\s*:?\s*(\d+(?:[.,]\d+)?)", value[label.end():])
            if following_amount:
                return following_amount.group(1)
            preceding_amounts = list(re.finditer(r"\d+(?:[.,]\d+)?", value[:label.start()]))
            if preceding_amounts:
                return preceding_amounts[-1].group()
    return None


def parse_nutrition_text(value: str) -> NutritionEvidence:
    """Extract numeric per-serving nutrition values from grounded source text."""

    result = NutritionEvidence(raw_text=value or None)
    if not value or not _PER_SERVING.search(value):
        return result
    result.calories = _nutrition_value(value, _CALORIE_LABEL)
    result.protein = _nutrition_value(value, _PROTEIN_LABEL)
    result.fat = _nutrition_value(
        value,
        _FAT_LABEL,
        exclude=("from", "monounsaturated", "polyunsaturated", "saturated"),
    )
    result.carbohydrates = _nutrition_value(value, _CARBOHYDRATE_LABEL)
    return result


_INLINE_GROUP = re.compile(
    r"(?P<name>[A-ZÀ-ÖØ-Þ][^\W\d_]*(?:[ \t]+[^\W\d_]+){0,3}):[ \t]*(?P<value>.+)$",
    re.UNICODE,
)


def split_inline_ingredient_group(text: str) -> tuple[str, int, str, int] | None:
    """Split a decorated inline group label from an ingredient line.

    Social captions commonly put an emoji before a short title-cased group
    label ("🌶️Chiles: 2 chiles"). Requiring an ingredient-like value keeps
    ordinary prose and colon-bearing directions out of this path.
    """
    matches = list(_INLINE_GROUP.finditer(text))
    if not matches:
        return None
    match = matches[-1]
    value = match.group("value").strip()
    if not value or not (
        looks_like_ingredient(value)
        or re.match(r"^\d?[¼½¾](?:\s|[a-z])", value, re.IGNORECASE)
    ):
        return None
    if re.match(r"^\d+(?:[.,]\d+)?\s*(?:seconds?|minutes?|hours?|segundos?|minutos?|horas?)\b", value, re.IGNORECASE):
        return None
    value_start = match.start("value") + (len(match.group("value")) - len(match.group("value").lstrip()))
    return match.group("name"), match.start("name"), value, value_start


def parse_yield_servings(value: str | None, *, allow_unlabelled: bool = False) -> str | None:
    if not value:
        return None
    makes_count = re.match(r"\s*makes?\s*:?\s*(\d+(?:[.,]\d+)?)\b", value, re.IGNORECASE)
    if makes_count:
        return makes_count.group(1)
    serves_count = re.match(r"\s*serv(?:es|ings?)\s*:?\s*(\d+(?:[.,]\d+)?)\b", value, re.IGNORECASE)
    if serves_count:
        return serves_count.group(1)
    match = re.search(
        rf"\b(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*\d+(?:[.,]\d+)?)?\s+{_YIELD_UNIT}\b",
        value,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    if allow_unlabelled:
        leading_count = re.match(r"\s*(\d+(?:[.,]\d+)?)\b", value)
        return leading_count.group(1) if leading_count else None
    return None


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
