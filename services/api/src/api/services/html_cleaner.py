from __future__ import annotations

from bs4 import BeautifulSoup, Comment, Tag

NOISE_TAGS = {
    "script", "style", "template", "nav", "header", "footer", "aside", "iframe", "noscript",
    "svg", "form", "button", "dialog", "input", "label",
}
NOISE_ATTRIBUTE_TOKENS = {
    "advert", "banner", "comment", "cookie", "newsletter", "popup", "promo", "related", "share",
    "sidebar", "subscribe",
}
SAFE_ATTRIBUTES = {
    "a": {"href", "title"},
    "div": {"class"},
    "img": {"src", "alt"},
    "span": {"class", "aria-label"},
    "input": {"class", "value", "aria-label"},
    "script": {"type"},
    "td": {"colspan", "rowspan", "scope"},
    "th": {"colspan", "rowspan", "scope"},
}
VOID_TAGS = {"br", "hr", "img", "input", "source", "track", "wbr"}


def _is_structural_container(element: Tag) -> bool:
    classes = set(element.get("class") or ())
    itemtype = element.get("itemtype") or ""
    return (
        element.name in {"html", "body", "main", "article"}
        or "node-przepis" in classes
        or "Recipe" in itemtype
        or element.find(["article", "main"]) is not None
    )


def _is_noise_element(element: Tag) -> bool:
    if _is_structural_container(element):
        return False
    attributes = " ".join([
        " ".join(element.get("class") or []),
        element.get("id") or "",
        element.get("role") or "",
    ]).lower()

    return any(token in attributes for token in NOISE_ATTRIBUTE_TOKENS)


def _is_recipe_servings_control(element: Tag) -> bool:
    if not element.attrs:
        return False
    classes = " ".join(element.get("class") or ()).casefold()
    aria_label = (element.get("aria-label") or "").casefold()
    return "recipe-servings" in classes or "adjust recipe servings" in aria_label


def _is_recipe_header(element: Tag) -> bool:
    if element.name != "header" or not element.attrs:
        return False
    attributes = " ".join([" ".join(element.get("class") or []), element.get("id") or ""]).casefold()
    return element.name == "header" and "recipe" in attributes


def _select_content_container(soup: BeautifulSoup) -> Tag:
    return (
        soup.find(class_="wprm-recipe-container")
        or soup.find(class_="node-przepis")
        or soup.select_one('[itemtype*="Recipe"]')
        or soup.find("article")
        or soup.find("main")
        or soup.body
        or soup
    )


def _keep_safe_attributes(element: Tag) -> None:
    allowed = SAFE_ATTRIBUTES.get(element.name, set())
    element.attrs = {name: value for name, value in element.attrs.items() if name in allowed}


def _remove_empty_elements(container: Tag) -> None:
    for element in reversed(container.find_all(True)):
        if element.name in VOID_TAGS:
            continue
        if not element.get_text(strip=True) and not element.find("img"):
            element.decompose()


def clean_html_body(raw_html: str) -> str:
    if not raw_html.strip():
        return ""

    soup = BeautifulSoup(raw_html, "html.parser")
    structured_recipe_data = [
        (element.get("type"), element.get("id"), element.string)
        for element in soup.find_all("script")
        if element.string and (
            element.get("type") == "application/ld+json"
            or (
                element.get("id") == "__POST_CONTENT__"
                and any(f'"client":"{client}"' in element.string for client in ("bbcgoodfood", "olivemagazine"))
            )
        )
    ]
    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()
    for element in soup.find_all(NOISE_TAGS):
        if element.name is None:
            continue
        if (element.name == "input" and _is_recipe_servings_control(element)) or _is_recipe_header(element):
            continue
        element.decompose()
    for element in list(soup.find_all(True)):
        if element.name is None or not element.attrs:
            continue
        if _is_noise_element(element):
            element.decompose()

    container = _select_content_container(soup)
    for element in container.find_all(True):
        _keep_safe_attributes(element)
    _remove_empty_elements(container)
    for script_type, script_id, payload in structured_recipe_data:
        script = soup.new_tag("script", type=script_type)
        if script_id:
            script["id"] = script_id
        script.string = payload
        container.append(script)

    return str(container).strip()
