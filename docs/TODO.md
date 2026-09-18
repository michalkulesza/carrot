# TODO

Items are grouped by purpose and ordered from highest to lowest importance within each group. Completed items must remain at the very end of their category.

## Most urgent

- [ ] **Recipe extraction v2 — restore trust in imports** — Current extraction failures, invented details, and mistakes have undermined trust and interest in the app. Main product decisions are aligned; next session starts with code inspection and a technical specification. Implementation has not started.
  - Extract recipe evidence from website/blog HTML before sending it to Gemini. Detect ingredient and instruction sections using document structure, headings, lists, quantities, and units; preserve order, original wording, and ingredient groups such as Main and Sauce. Do not depend exclusively on JSON-LD or metadata for these details.
  - Confirmed website preprocessing: return cleaned body HTML with scripts, styles, and obvious clutter removed while preserving HTML structure, headings, lists, grouping, and links. Clean conservatively so potential recipe evidence survives; recipe selection belongs to the extractor.
  - Confirmed initial source languages: English, German, Polish, French, and Spanish (en, de, pl, fr, es), including recipe headings, ingredient/unit clues, and instructions.
  - Confirmed multi-recipe page selection: select the main recipe; if there is no clear main recipe, select the first recipe in document order. Do not merge separate recipes or require a recipe-selection prompt for this edge case.
  - Confirmed rollout scope: use v2 for new imports only after manual approval. Re-extraction or migration of existing saved recipes is outside initial scope.
  - Confirmed initial website flow: cleaned HTML -> recipe extractor -> Gemini enrichment. The extractor is the authoritative source of recipe content; prioritize measuring and improving its reliability. Do not send broader page content to Gemini to recover missed sections in the initial implementation.
  - Optional future idea, outside initial scope: when the website extractor cannot identify recipe sections, let Gemini inspect the broader cleaned HTML as a fallback. Evaluate separately before enabling; it must still preserve source evidence and never invent missing details. This optional website fallback is separate from the already agreed social audio fallback.
  - Preserve links to recipes used as ingredients/components, such as a linked sauce recipe. Keep the ingredient clickable and offer an explicit action to import the linked recipe as a separate, linked recipe. Do not automatically import linked recipes into the user's library.
  - When a sauce/component is mentioned without its ingredients or a usable linked recipe, retain it as an ingredient and link it to the original recipe source so the user can inspect it. Do not invent its composition. Consider a user action to report an extraction mistake; the reporting workflow remains to be defined.
  - Preserve source evidence alongside every extracted ingredient and step, including group headings and links, so mistakes are traceable. Treat quantities and units as detection clues, not mandatory conditions: ingredients such as "salt to taste" must still be retained.
  - Support website/blog HTML and social-media text through a shared extraction format. Reuse the existing ScrapeCreators integration for social descriptions and comments, and the existing Gemini audio extraction/transcription fallback.
  - Confirmed social flow: first pass the description and creator-authored comment(s) to the extraction function and check whether ingredients and instructions are present. If both are found, pass the extracted evidence to ML enrichment without processing audio. Otherwise, try a linked full-recipe website through HTML cleanup and the recipe extractor before falling back to audio. Audio transcription is a last resort when the preceding stages do not provide both. Missing quantities alone do not mean ingredients are absent. Following a full-recipe source link is distinct from importing linked component recipes, which remains an explicit user action.
  - Confirmed audio fallback: pass the transcript to Gemini/ML to determine whether it contains ingredients, instructions, both, or neither, and extract only supported information. Do not require the deterministic HTML/text detector to recognize recipe structure in the transcript before sending it to ML. Model-based recipe detection/extraction precedes downstream enrichment in this fallback.
  - Confirmed social evidence merge: retain partial evidence from the description/comment(s) when falling back to audio, and supply it alongside the transcript to ML. Combine complementary information for the same recipe (for example, ingredients from the description and instructions from audio), preserve the source of each extracted item, and assess the combined evidence before enrichment.
  - Confirmed comment rule: only comments and replies authored by the post's creator may contribute recipe evidence. Exclude viewer-authored substitutions, suggestions, and other comments. Comments with unverified authorship must not be treated as creator-authored evidence.
  - Confirmed conflict rule: apply explicit creator corrections when available; otherwise, the caption/description takes precedence over conflicting audio. Preserve the competing source evidence and which rule selected the value for traceability. A caption/audio disagreement resolved by this rule does not require user review. Do not process audio solely to check for disagreements.
  - Confirmed partial-import outcome: after exhausting applicable extraction stages, create/save the recipe in both partial cases, retaining available content and its source link. Return and persist `MISSING_INGREDIENTS` when instructions exist without an ingredient list, or `MISSING_INSTRUCTIONS` when ingredients exist without instructions. These codes belong to the saved recipe and do not block its creation. If neither ingredients nor instructions are found, report extraction failure instead of creating an empty recipe.
  - Confirmed issue dismissal: show a localized banner for each persisted missing-content code in web/mobile recipe UI. Dismissing a banner removes that code from the saved recipe through a persisted update, so it stays dismissed after reload. Repeated dismissal must be idempotent and remove only the selected code. Dismissal does not supply missing content, enable cooking mode without steps, or make nutrition/allergen information complete.
  - Required structured failures: define a closed error-reason enum in the extraction response so ML selects a supported reason when extraction fails. Validate model responses on the backend and map codes to localized explanations and recovery actions in web/mobile UI; do not rely on free-form model text to control UI behavior. Distinguish complete, incomplete, and failed outcomes; missing instructions in a saved partial recipe are an incompleteness reason, not a terminal error. An unsuccessful intermediate stage must still allow the configured fallbacks.
  - Confirmed model-selectable partial-recipe codes: `MISSING_INGREDIENTS` and `MISSING_INSTRUCTIONS`. Proposed terminal reasons: `NO_RECIPE_CONTENT` (no ingredients or instructions in the supplied evidence), `AMBIGUOUS_RECIPE` (cannot separate recipe content reliably, not merely multiple recipes on a page where the main/first selection rule applies), and `UNREADABLE_CONTENT` (supplied content is too garbled to extract reliably). Check the enum contract against existing import errors during technical planning, preserving the distinction between saved recipes with issue codes and failed imports.
  - Operational failures must be assigned by the backend, not guessed by ML: source access/fetch failures, transcription failures, model timeout/rate limiting, invalid model responses, and an unknown-error fallback. The UI should offer source inspection or another input for content problems and retry for recoverable operational failures. Preserve the failure stage and diagnostic evidence for review; include outcome, reason code, and stage in the evaluation spreadsheet. Unknown or invalid model reason codes must map to a safe fallback.
  - Required web/mobile UI support: make incomplete imports visibly distinct from complete recipes and failed imports; show "Instructions unavailable" with an action to open the source while keeping extracted ingredients usable. Do not invent an overview or show an empty guided cooking flow when there are no instructions; explain why cooking mode is unavailable. Reflect incomplete nutrition and uncertain allergens explicitly. Add all new strings in en, pl, de, fr, and es.
  - Pass the extracted evidence to Gemini for subsequent processing, including nutrition, allergens, and units. Add a brief high-level cooking overview before the detailed steps.
  - Confirmed enrichment uncertainty rule: when a component's composition is unknown (for example, an unspecified sauce), mark nutrition as incomplete and allergen information as uncertain instead of guessing its ingredients. Also mark nutrition as incomplete when missing quantities prevent a meaningful calculation. Do not present partial nutrition as a complete recipe total or unknown allergens as absent.
  - Build a batch review script accepting around 100 mixed HTML/text inputs. Export a spreadsheet showing source identity, extracted evidence, the exact model input, and model responses for manual review.
  - Confirmed evaluation dataset ownership: the user will gather and supply the review examples.
  - Confirmed release gate: the user manually reviews the evaluation results and explicitly approves replacing the current extractor. No automatic percentage threshold substitutes for that approval.
  - Build the review script before changing extraction, then compare current extraction with v2 against the same saved inputs. Capture reviewer corrections so reviewed cases become a regression dataset.
  - Proposed safeguards to discuss: trace extracted fields to source evidence; distinguish source facts from estimates; flag missing or conflicting information instead of inventing it; retain source quantities alongside conversions; generate the overview only from supported steps.
  - Proposed evaluation additions: frozen source fixtures, current-versus-v2 comparisons, reviewer corrections and error categories, separate extraction/enrichment scores, and model/prompt versions, cost, latency, and failures. Include incomplete recipes, multiple recipes per page, grouped ingredients, linked components, and ambiguous social comments.
  - Confirmed missing-information rule: preserve whatever the source provides, leave unspecified quantities and cooking details empty, and let the user inspect the source. Gemini must never invent missing amounts or cooking instructions, including times and temperatures. Distinguish information absent in the source from information present but missed by extraction; the latter is an extraction defect.

- [ ] **Unit/amount parser v2** — Follow-up work after recipe extraction v2. Apply the same source-faithfulness and manual-review rules: preserve original amounts and units, do not invent missing values, and make uncertainty explicit. Evaluate separately on 100 examples with reviewable inputs and parser outputs, record manual corrections, and require the user's explicit approval before replacing the current parser. Detailed parser requirements remain to be specified in that phase.

### Next steps for the urgent work

1. Inspect the existing import pipeline, ScrapeCreators integration, website extraction, Gemini calls, unit/amount parsing, recipe storage, and web/mobile error UI. Identify reusable parts and gaps against the decisions above.
2. Write the extraction v2 specification and implementation plan under `docs/specs/`. Define the extraction/enrichment boundary, source evidence format, stage ordering, error/issue enums, recipe persistence, banner dismissal, UI states, verification, and rollout. Resolve remaining technical edge cases and distinguish optional ideas from initial scope.
3. The user gathers the roughly 100 extraction examples. Define a repeatable input format and save source snapshots so repeated runs use the same evidence.
4. Build the batch review script first and capture current-pipeline results. Export source evidence, extractor output, exact model inputs/responses, outcome/error codes, and reviewer notes in the spreadsheet.
5. Implement extraction v2 and its web/mobile support in bounded tasks against the specification. Keep the current production extractor active during evaluation; cover all five languages, partial imports, links, fallbacks, and repeated actions.
6. Run the same examples through v2, have the user manually review the spreadsheet, fix identified problems, and retain corrected cases as regressions. Switch new imports to v2 only after the user's explicit approval; leave existing recipes unchanged. Move the plan to `docs/specs/completed/` only once implementation is fully complete.
7. Then specify and implement unit/amount parser v2, evaluate it on its own 100 examples, and require a separate manual review and approval before replacing the current parser.

## Core product features

- [ ] **Visual recipe library / grid view** — Let users switch between the compact list and a photo-forward card or grid view with useful metadata such as tags, cooking time, and favourite status.

- [ ] **Multiple meals per day** — Support breakfast, lunch, dinner, and leftovers instead of a single recipe for each date.
- [ ] **Round up fractional shopping-list quantities** — Display purchasable whole-item amounts while retaining the precise underlying quantity to prevent over-buying.
- [ ] **Cook from what I have / pantry** — Track pantry staples, rank recipes by missing ingredients, and subtract pantry items from the shopping list.
- [ ] **Web recipe import source icons** — Add icons for supported sources beneath the import method buttons.
- [ ] **Make the allergen pass opt-in** — Skip the allergen Gemini call entirely while a user has no allergens set. Enable it the moment the first allergen is added in settings, and backfill existing recipes with an allergens-only pass (no re-extraction, no re-enrichment). Show an in-app progress message while the backfill runs and send a notification when it finishes.
-------------------------------------------------------------
- [x] **When importing recipe send it to the background straight away** - inseatead of waiting at the skeleton screen, drop it in the bg, and show placeholder, redirect to recipe page
- [x] **Ingredient scaling / adjust servings** — Released in 1.0.1 with serving-size steppers on web and iOS, live structured-ingredient recalculation, and scaled shopping-list additions.
- [x] **Useful Home screen** — Show tonight’s meal
- [x] **Move recipe add button** — Moved the mobile add action to a persistent orange glass button matching the Meal Plan “Today” control.
- [x] **Don't attach ingredients to the final assembly step** — When mapping ingredients to recipe steps, skip the last/final assembly step so ingredients aren't duplicated onto it.
- [x] **Cooking time estimation** — Estimate each recipe's cooking time and show it in the stat boxes, in the far-left box.
- [x] **Improve prompts** — Refined recipe-import query boundaries: source-only extraction schema, enrichment-only schema with a validated combiner, deduplicated allergen analysis, and honoured per-import model overrides. See docs/specs/refine-recipe-import-queries.md.
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

- [ ] **Web recipe details looks not great** !!!!!!!
- [ ] **iOS Universal Links for recipe URLs** — Configure the Associated Domains entitlement and `apple-app-site-association` hosting so supported Carrot web recipe links can open the native app, with authenticated scope handling and browser fallback.
- [ ] **Delightful empty and loading states** — Extend shimmers to recipe lists and meal plans; add friendly empty states, restrained Carrot mascot moments, import-stage animation, haptics, and completion feedback.

- [ ] **Colours and themes** — Define and apply a cohesive theme system.
-------------------------------------------------------------
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


- [ ] **Automated tests** — Add meaningful coverage for core user flows and regressions.
- [ ] **Premium lock** — Gate paid capabilities with a clear upgrade flow.
- [ ] **Social tab and shareable recipes** — Add a discovery surface for recipes users choose to publish.
-------------------------------------------------------------
- [x] **Reduce extraction hallucinations (prompt/model tuning)** — Cheap first lever before a full validation pass: add an anti-fabrication clause to the extraction prompt, set `temperature=0`, and route the faithful-extraction call to `gemini-2.5-flash` (keeping shopping-list/unit-conversion on `flash-lite`). See `docs/specs/reduce-extraction-hallucinations.md`.
- [x] **Public sharing** — Create shareable public recipe pages.

## Portfolio / showcase

- [ ] **Weekly meal-plan generator** — Auto-fill a week while honoring allergens, preferences, and variety, then generate its shopping list. Specify the week as craving quotas (Chicken ×2, Pasta ×2, Asian ×1) plus an optional free-text wish; a deterministic solver proposes a week from the library with per-day lock/reroll and an honest coverage bar. Blocked on `docs/specs/household-v2.md`. See `docs/specs/weekly-meal-plan-generator.md`.
- [ ] **Polished stats and insights dashboard** — Visualize cooking habits, favourite cuisines, streaks, and import history using the existing stats data.
- [ ] **Operational import dashboard** — Track pipeline latency, queue depth, cost, cache-hit rate, failures, retries, model usage, and per-job traces.
-------------------------------------------------------------
- [x] **Semantic recipe search** — Use pgvector embeddings for natural-language queries such as “something warm and spicy for a cold night.”
