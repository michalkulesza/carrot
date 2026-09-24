# Completed work

Completed backlog items, grouped by the category used in [TODO.md](TODO.md). Items marked complete in TODO are moved here; open work remains in TODO.

## Most urgent

- [x] **Preserve ingredient groups in social imports** — Inline labels in the [Instagram capture](../services/api/tests/captured-payloads/instagram-Dcg94qVxius.json) are retained as ingredient groups in selected-line and deterministic extraction, with offline regression coverage.

- [x] **Route image imports through extractor v2** — Image jobs use one Gemini vision transcription call per attempt, then the shared v2 extraction, enrichment, and persistence path. Web and mobile remain connected to the image job API; the legacy image pipeline was removed. Live pancake-image and isolated database checks passed. Completed: [image import extractor v2](specs/completed/image-import-extractor-v2.md).

- [x] **Review serving quantity scaling** — Verified serving changes across metric and US ingredient variants; fixed quantity ranges, per-item measurements, and tiny nonzero amounts in [ingredientScaling.ts](../packages/shared/src/utils/ingredientScaling.ts).

- [x] **Unit/amount parser v2** — Connected deterministic parsing to active recipe ingestion. Text and image imports preserve each full source ingredient line as `shopping_list_value`; the image extraction path no longer asks Gemini to split quantities or units. Reviewed benchmark: 200/200 diverse rows and 447/447 foreign-language rows agree exactly on `qty`, `unit`, and `name` (status excluded). Removed the unused legacy text extraction helper and Gemini splitting prompt. Completed: [unit/amount parser v2](specs/completed/unit-amount-parser-v2.md).

- [x] **Manual orchestrator v2 review CLI** — Accept one or many captured JSON envelopes, run the real orchestrator/extractor, use saved transcripts without retranscription, and export Excel stage inputs/outputs, detected languages, completeness decisions, recipe evidence, and errors. Completed: [manual extraction review](specs/completed/manual-extraction-review.md).
- [x] **HTML cleaner for extraction v2** — Accept raw HTML captured from a URL, conservatively remove scripts, styles, and obvious page chrome while retaining meaningful body structure, headings, lists, links, and recipe evidence. The `ExtractionOrchestrator` must invoke it before passing HTML to `ExtractorV2`.
- [x] **ExtractionOrchestrator for extraction v2** — Accepts versioned social or raw-HTML payloads, selects and sequences evidence, verifies creator authorship, cleans HTML, calls source-agnostic `ExtractorV2`, classifies completeness, and applies eligible fallbacks/merges before enrichment. Core implementation and production integration are complete; remaining TikTok fixture evaluation is tracked under [Extractor v2](specs/extractor-v2.md). Completed: [orchestrator implementation](specs/completed/extraction-orchestrator.md).
  - [x] Add reviewed extraction-v2 regression fixtures for French, German, and Spanish recipes.
- [x] **Local Instagram fixture capture tool for ExtractorV2** — A standalone, local-only authenticated browser tool: accept one or more Instagram post/reel URLs, let the user sign in interactively using a persistent local browser profile, and save repeatable fixtures containing the caption/description, post/creator metadata, creator-authored comments and replies with authorship evidence, and audio/video references or downloaded audio where available. Preserve the raw ScrapeCreators-shaped response and add a versioned normalized envelope so the `ExtractionOrchestrator` can replace ScrapeCreators with captured fixtures without adapter changes. Do not send browser credentials or session data to Carrot services; fixtures must clearly record unavailable fields and capture failures.
- [x] **Gemini-assisted extraction v2 text selection** — Implemented source-line selection for ingredients, instructions, component headings, explicit yield, and nutrition using `gemini-3.1-flash-lite`, with validated evidence and deterministic fallback. Gemini returns line IDs for yield and nutrition, while the server parses their actual values deterministically. Instagram/social captures use Gemini by default in the review runner; HTML remains deterministic. Production rollout is complete; model accuracy review is tracked separately. Plan: [Gemini text selection](specs/completed/extraction-v2-gemini-selection.md).
  - [x] Preserve redacted provider status, message, code, and structured details in extraction review artifacts when selection falls back.
  - [x] Remove leading emoji/list markers from selected ingredients and steps, and deterministically parse numeric-only per-serving nutrition values from Gemini-selected source lines while preserving full source evidence.
  - [x] Combine selected wrapped source lines into their preceding numbered instruction, retaining a reference for every source line.
  - [x] Permit instruction-only selections when ingredient names and quantities appear only inside cooking directions.
  - [x] Ignore unsupported or garbled secondary social-caption blocks when supported recipe evidence is available; retain a partial supported recipe when an unsupported transcript adds no usable evidence.
  - [x] Defer an unsupported sparse social-caption language failure when an audio fallback is available; accept a separately detected supported transcript as the recipe source.
  - [x] Reject product/appliance reviews and incidental serving suggestions as recipe evidence unless the source presents a genuine self-contained recipe.
  - [x] Materialize comma- and bullet-separated ingredient-list items as individually grounded ingredients, while retaining preparation qualifiers such as "salt, to taste" as one item.
  - [x] Ground Gemini audio-extraction wording back to an exact matching transcript span, repairing only matchable mojibake instead of accepting altered source text.
  - [x] Reject an audio-only partial extraction when caption/comment evidence provides no recipe anchor, preventing unrelated spoken fragments from being saved as recipes.
  - [x] Select explicit yield/portion source lines and derive the numeric serving count server-side.
  - [x] Replay reviewed Gemini line selections in captured regressions and recognize explicit serving/portion lines deterministically in all five supported languages.
  - [x] Ignore optional yield selections that do not contain a deterministic serving count, so an overlapping ingredient line cannot invalidate the complete Gemini selection.
- [x] **Extraction v2 production cutover** — New URL and pasted-text imports use v2 without a legacy runtime fallback. Field-level enrichment, source/AI provenance, partial/failed outcomes, web/mobile states, creator-linked pages, and obsolete extraction cleanup are complete and verified. TikTok fixture expansion and Facebook support remain separate follow-up work. Plan: [extraction v2 production cutover](specs/completed/extraction-v2-production-cutover.md).
  - [x] Follow full-recipe links explicitly shared in a social post description or verified creator-authored comment/reply before audio fallback; exclude viewer-authored links and preserve the linked page as evidence.

## Core product features

- [x] **When importing recipe send it to the background straight away** - inseatead of waiting at the skeleton screen, drop it in the bg, and show placeholder, redirect to recipe page
- [x] **Ingredient scaling / adjust servings** — Released in 1.0.1 with serving-size steppers on web and iOS, live structured-ingredient recalculation, and scaled shopping-list additions.
- [x] **Useful Home screen** — Show tonight’s meal
- [x] **Move recipe add button** — Moved the mobile add action to a persistent orange glass button matching the Meal Plan “Today” control.
- [x] **Don't attach ingredients to the final assembly step** — When mapping ingredients to recipe steps, skip the last/final assembly step so ingredients aren't duplicated onto it.
- [x] **Cooking time estimation** — Estimate each recipe's cooking time and show it in the stat boxes, in the far-left box.
- [x] **Improve prompts** — Refined recipe-import query boundaries: source-only extraction schema, enrichment-only schema with a validated combiner, deduplicated allergen analysis, and honoured per-import model overrides. See [the prompt plan](specs/completed/refine-recipe-import-queries.md).
- [x] **Quick plain-text meal entries** — Add a one-per-day free-text meal alongside recipes, shared within the active personal or household plan.
- [x] **Make sure sharing work on physical device**
- [x] **Fix recipe share options in household context** — In household recipe details, offer adding household-only recipes to the personal library and hide household sharing for recipes already in a household.
- [x] **Fix cooking mode sync** - between recipe details and app settings, they do not sync to eachother
- [x] **Unified ingredient list with collapsible groups** — When a recipe has multiple ingredient groups (e.g. Main and Sauce), show one combined "Ingredients" list of everything at the top, then render each group as its own collapsible section that is collapsed by default, with a caret/chevron at the end of each group header.
- [x] **RE RUN PRODUCTION** recipes
- [x] **Add related recipes** — Add reciprocal links between recipes, with a related-recipes section on web and mobile.
- [x] **Guided Cook Mode** — Full-screen, big-type, swipeable steps; keep the screen awake, surface timers from step text, and allow ingredient checkoff while cooking.
- [x] **Custom tags** - Bring back custom tags

## Experience and product polish

- [x] **When loading from an empty state** — Wait for authentication before loading recipes and the next planned meal, rather than showing an unauthenticated error.
- [x] **Correct household recipe contributor avatars** — Show the actual contributor alongside the household avatar when the recipe is also in a personal library.
- [x] **Respect the safe area in meal-plan search** — Bound the picker drawer’s keyboard-expanded range to the device safe area.
- [x] **Use native-style meal-plan search** — Match the picker drawer’s search field to the rounded, borderless recipe-library search bar.
- [x] **Review dark mode** — Fix automati/clearc appearance detection and verify all screens in dark mode.
- [x] **Preserve tsp and tbsp units** — Do not convert teaspoon or tablespoon measurements to grams or millilitres.
- [x] **Collapse only extra ingredient groups** — For recipes with groups beyond Main, collapse each additional group’s ingredients only; keep the recipe steps visible.
- [x] **Simplify tags and allergens** — Removed all custom-tag/custom-allergen support (predefined-only now); the full predefined tag and allergen lists are always sent to Gemini during import, and matched allergens show as badges on the recipe, independent of the viewer's own allergen preferences.
- [x] **Move add recipe to bottom drawer**
- [x] **Haptics and native context menus** — Add meaningful haptic feedback and long-press recipe actions (favourite, plan, share, delete) with a peek preview.
- [x] **Anythign to do with top position px that is a hook that takes a while to reload ie jump when importing via share**

## Quality, release, and growth

- [x] **Reduce extraction hallucinations (prompt/model tuning)** — Added an anti-fabrication clause, set `temperature=0`, and routed faithful extraction to `gemini-3.1-flash-lite`. See [the plan](specs/completed/reduce-extraction-hallucinations.md).
- [x] **Public sharing** — Create shareable public recipe pages.

## Portfolio / showcase

- [x] **Semantic recipe search** — Use pgvector embeddings for natural-language queries such as “something warm and spicy for a cold night.”
