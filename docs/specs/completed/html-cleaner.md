# HTML cleaner for extraction v2

## Purpose

Convert a raw HTML source payload into conservative cleaned body HTML for `ExtractionOrchestrator` and `ExtractorV2`. It is not a recipe parser and must not invent, translate, summarize, or flatten recipe content.

## Contract

`clean_html_body(raw_html: str) -> str`

- Removes executable, interactive, and obvious site-chrome elements.
- Selects the most specific semantic content container: known recipe container, then `article`, `main`, `body`, then the document.
- Preserves semantic HTML structure, headings, paragraphs, lists, tables, and links.
- Preserves only safe, extraction-relevant attributes: `href` on links, `src` and `alt` on images, and table accessibility attributes.
- Removes comments and empty non-void elements.
- Does not select a recipe, extract fields, translate text, or call external services.

## Acceptance criteria

- Recipe headings, grouped ingredient lists, instruction lists, and linked components remain in document order.
- Scripts, styles, forms, navigation, headers, footers, sidebars, cookie banners, advertisements, and popups are absent.
- Generic structural containers are not removed merely because a theme class contains a noise word.
- Empty/whitespace-only input returns an empty string.
- The cleaner is covered by unit tests before it is used by `ExtractionOrchestrator`.
