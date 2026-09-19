# Extractor v2 implementation plan

Status: implementation in progress. This plan covers the source-agnostic extractor and its evaluation through the existing orchestrator. It does not enable production imports.

## Goal and scope

Turn cleaned HTML or normalized plain text into ordered, source-faithful recipe evidence. Preserve ingredients, instructions, group headings, wording, and component links without inventing missing information. Support English, Polish, German, French, and Spanish. The user must be able to inspect where each extracted item came from and compare v2 with the current pipeline before approving a replacement.

Requirements: [product backlog](../TODO.md), [orchestrator plan](completed/extraction-orchestrator.md), [input envelope](extraction-orchestrator-input.md), and [HTML cleaner](completed/html-cleaner.md).

This is the next **Extractor v2** backlog item, not a rewrite of the orchestrator. Include the small contract and orchestration changes needed to connect a real extractor correctly. Track broader persistence, enrichment, UI, and rollout work as explicit follow-up release dependencies.

Out of scope: translation, image extraction, migration of standalone text imports, existing-recipe re-extraction, unit/amount parser v2, automatic component imports, and Gemini recovery from broader website HTML. Audio remains the orchestrator's separate model-based fallback; it does not need to pass deterministic text detection first.

## Current implementation and constraints

| Existing code | Implication for this work |
| --- | --- |
| `services/api/src/api/services/extraction_v2/contracts.py` | `ExtractorV2` is a protocol with async `extract_html(ExtractionInput)` and `extract_text(ExtractionInput)` methods. Implement it; keep `ExtractedRecipe` as the shared output. |
| `extraction_v2/orchestrator.py` | Already cleans HTML, gates languages, sequences text/links/audio, and classifies final outcomes. Existing tests predominantly inject fake extraction results. Add real-extractor integration tests. |
| `extraction_v2/sources.py` | `normalize_segments` computes per-source spans, but `ExtractionInput` currently receives only content and IDs. Accurate item attribution requires passing those spans. |
| `services/api/src/api/services/html_cleaner.py` | Removes scripts and most attributes, including internal classes and microdata attributes; selects one content container. Extraction cannot depend on JSON-LD, original CSS selectors, or discarded content. |
| `extraction_v2/merge.py` | Deduplicates exact text and allows merging when a title is absent. It does not implement semantic conflict resolution or explicit creator corrections. Do not treat those policies as already verified. |
| `extraction_v2/adapters.py` | Audio extraction exists separately. Preserve its compatibility when extending evidence contracts. |
| `services/api/src/api/services/pipeline.py` | Legacy HTML/text preparation and Gemini extraction remain the production baseline. Do not replace their behavior during evaluation. |
| `tools/instagram-fixture-capture/captured-payloads/` | Existing HTML/social captures can seed evaluation; validate coverage and capture quality rather than assuming the user-approved dataset is complete. |

The orchestrator document has already been moved to `completed/` in the working tree, but still lists evaluation and real-extractor integration as unfinished. This plan carries those dependencies forward without moving or rewriting that document.

## Ownership and public contract

Implement `RecipeEvidenceExtractor` in `extraction_v2/extractor.py`, satisfying the existing `ExtractorV2` protocol. It performs no network requests, model calls, database writes, language-policy decisions, source acquisition, or fallback selection. Its results must be deterministic for the same input and detector version.

Keep source kind, platform, creator identity, source priority, and URLs used for acquisition outside the extractor. Evidence IDs are opaque: renaming `caption:0` to an arbitrary ID must not change detection.

Extend `ExtractionInput` with validated source-neutral spans: `{evidence_id, start, end}`, using half-open Python character offsets into the exact supplied `content`. For single-source inputs, an omitted span may mean the whole document. Multiple IDs without spans are invalid; never attach all IDs to every fact as a substitute for attribution. Pass the existing normalized spans from the orchestrator, and preserve a normalization mapping back to the captured source text. Validate bounds, order, non-overlap, and ID membership.

Use structured evidence references for new output: opaque evidence ID, locator kind, locator, and quoted text. Retain current `evidence_ids` and `locator` compatibility while updating all producers/consumers together. Text references identify exact character spans. HTML references identify a deterministic node path plus text offsets in that node's rendered text, with the cleaned-input hash identifying the document version. Define one whitespace/entity normalization function shared by extraction and reference validation. References must resolve to the emitted wording under that documented normalization.

Preserve heading evidence for component names and title evidence when a title is present; neither should be synthesized. Support multiple references/links on an item so nested markup or two component links do not lose evidence. Keep source wording as the canonical value; parsed quantities or enrichment are separate derivatives.

The extractor preserves raw relative link targets. The orchestrator resolves them against the final fetched URL and applies the existing URL policy before exposing navigable links. Unsafe schemes cannot become clickable actions. A component without a usable link retains its ingredient text; the caller supplies the original recipe source as its inspection link. No link is fetched by the extractor.

Output continues to use ordered `RecipeComponentEvidence` objects. Unnamed recipe-wide instructions stay in an unnamed component; do not assign them to an ingredient group by guesswork. Preserve identical ingredient names in distinct groups and repeated instruction text when it represents separate source steps. Reject whitespace-only facts.

Return supported facts even if one section is absent. The orchestrator computes `MISSING_INGREDIENTS` or `MISSING_INSTRUCTIONS` after eligible fallbacks. With no facts, return `NO_RECIPE_CONTENT`; reserve `UNREADABLE_CONTENT` for genuinely unusable text and `AMBIGUOUS_RECIPE` for content that cannot be reliably separated. Multiple recipes alone are not ambiguous. Malformed input and internal exceptions are operational failures, not content failures; update broad orchestrator exception handling so deterministic parser errors are not mislabeled as model responses.

## Detection approach

### Shared blocks and language clues

Build a small internal block representation with ordered text, heading level, list/table context, links, source references, and container ancestry. HTML and plain-text adapters feed shared section detection and grouping rules. Keep language clue tables in a focused `lexicons.py` module; use all five supported-language vocabularies without translating or adding a second language gate.

Clues include ingredient/instruction headings, common group introductions, quantity/unit patterns, and cooking verbs. Quantity/unit recognition helps detect a section but does not parse or convert amounts. Once an ingredient section is established, retain quantity-free items such as salt to taste, water as needed, and named sauces. A number alone is insufficient evidence: nutrition tables, dates, ratings, serving metadata, and advertising must not become ingredients or steps.

### HTML entry point

1. Parse the supplied cleaned HTML using the existing BeautifulSoup dependency. Walk it once into blocks, preserving DOM order and provenance. Handle headings, nested lists, paragraphs, `<br>` lines, ingredient tables, and links. Avoid extracting both a parent list and its child items as duplicate facts.
2. Identify candidate recipe regions from heading hierarchy and bounded sibling/container structure. Stop sections at peer headings or explicit non-recipe sections; do not absorb comments, nutrition panels, or another recipe.
3. Rank the main recipe using structural association with the document title and recipe sections. Freeze an explicit ranking tuple and tie-break rules in tests. Completeness alone must not let a complete secondary recipe displace a clearly primary partial recipe. If no main recipe is clear, choose the first recipe candidate in document order.
4. Within that candidate, extract ingredient and instruction sections independently. Prefer explicit headings plus local structure; allow heading-free lists when multiple recipe clues establish their role. Keep uncertain prose out of the result rather than manufacturing a section.
5. Preserve group headings, item order, links, and exact wording. Strip list markers and normalize formatting whitespace only; never rewrite quantities, temperatures, durations, or preparation details.

The cleaner currently selects a container before extraction. Add raw-HTML-through-cleaner fixtures for multi-recipe pages and recipe evidence outside the first article/widget. If evidence is lost before extraction, fix only the demonstrated cleaner boundary defect in a separately bounded task. Do not compensate by sending raw HTML or broader content to Gemini.

### Plain-text entry point

Recognize explicit headings, bullet/numbered lists, blank-line sections, and clearly delimited inline sections such as `Ingredients: ... Instructions: ...`. Preserve newlines and meaningful punctuation. Do not split ingredient items blindly at commas: `tomatoes, drained` is one item. Numbered steps preserve order; prose instructions require affirmative cooking/section context rather than merely mentioning food.

Process segment boundaries deliberately: a heading and list can span adjacent verified input segments, but each fact references only the segment(s) containing its wording. Do not infer authorship or precedence from IDs. Exclude hashtags, promotion, and standalone URLs as facts while retaining links associated with extracted ingredients.

Correction language may be represented as a grounded candidate relationship between an old fact and replacement text, with both references. The orchestrator owns deciding whether a verified creator correction overrides another source. Ambiguous targets are retained in diagnostics and never silently applied. Do not try to solve general semantic corrections with an unbounded regex collection; record unsupported cases for review and block release if required cases remain unresolved.

## Implementation sequence

Each task runs on a branch/worktree with a bounded build/check/fix loop, at most three repair iterations per task before reporting the unresolved issue. Keep the plan and verification notes current. No commits until the user confirms completeness and correctness.

### 1. Establish replay and baseline before changing extraction

- [ ] Add a local runner under `tools/extraction-review/`, with a manifest of fixture IDs, hashes, input paths, frozen linked-page responses, transcripts, and optional expected outcomes. Reuse version 1 capture envelopes without changing capture files.
- [ ] Inject frozen acquisition into a legacy evaluation adapter so legacy and v2 use identical saved inputs. Missing snapshots are recorded failures, never silent live fetches. Disable recipe persistence and cache side effects.
- [ ] Record source/prepared input, exact model requests and responses, outcome/reason/stage, prompt/model/code versions, latency, usage, and reviewer corrections. Keep extraction and enrichment outputs distinct where the existing boundaries permit it.
- [ ] Export XLSX using existing `openpyxl`, backed by full JSON artifacts so spreadsheet cell limits cannot truncate audit evidence. Treat untrusted cell content as literal text, not spreadsheet formulas. Use stable case IDs so reruns preserve reviewer notes.
- [ ] Provide offline replay by default and explicit options for paid model execution, bounded concurrency, call budget, and resume. Capture the legacy baseline before implementing detection. Dataset collection remains user-owned; incomplete coverage is visible in the report.

Acceptance: the same fixture hashes are used for both variants, offline runs make zero network calls, and full requests/responses are recoverable from each spreadsheet row. The runner can operate on a small seed set before the full roughly 100-case dataset is ready.

### 2. Make evidence attribution implementable

- [ ] Add input spans, structured output references, heading/title evidence, and link representation. Update normalized-text mapping, orchestrator wiring, audio adapter compatibility, and validators.
- [ ] Implement shared block and reference helpers in focused modules such as `blocks.py` and `evidence.py`.
- [ ] Add contract tests for renamed IDs, invalid spans, Unicode, repeated text, normalization, nested HTML, and links. Round-trip every extracted quotation to its input.

Acceptance: every emitted fact and group heading can be attributed without inspecting a platform/source-kind string. Existing payload fixtures and orchestrator fake-provider tests still work after intentional contract updates.

### 3. Implement HTML recipe selection and extraction

- [ ] Add `html_blocks.py`, shared section rules, five-language clue tables, and `RecipeEvidenceExtractor.extract_html`.
- [ ] Cover complete/partial pages, lists, tables, paragraph steps, groups, quantity-free ingredients, component links, multi-recipe selection, and negative content.
- [ ] Test the real cleaner boundary and document any required narrow correction before adding it.

Acceptance: expected facts match reviewed fixture wording and order; no facts leak from a secondary recipe; metadata-only/script-only recipe data cannot bypass the cleaned-body contract.

### 4. Implement normalized-text extraction

- [ ] Add `text_blocks.py` and `extract_text`, reusing shared selection rules instead of platform-specific branches.
- [ ] Cover multiline and inline headings, bullets, numbering, unheaded recipe text, caption/comment boundaries, empty input, promotion, and unsupported correction targets.
- [ ] Add equivalent HTML/text fixtures to establish consistent output where the source evidence is equivalent.

Acceptance: all five languages have reviewed positive, partial, and negative cases. Missing amounts remain missing, ingredient preparation commas survive, and arbitrary ID renaming does not change extracted content.

### 5. Connect and verify the real orchestrator path

- [ ] Provide evaluation dependency assembly using the real extractor, existing language detector/cleaner, frozen page/transcript providers, and recorded audio model responses.
- [ ] Exercise complete social text skipping all fallbacks; partial text followed by linked HTML; caption ingredients plus audio instructions; exhausted fallbacks producing partial results; and no evidence producing failure.
- [ ] Resolve integration defects exposed by actual results: content-failure objects must not survive into a successful merge; unrelated recipes must not merge merely because a title is absent; conflicting amounts must not be appended as two ingredients; explicit corrections need grounded targets and trace records.
- [ ] Keep policy in the orchestrator/merge layer. Record rejected/conflicting evidence and precedence, including caption over audio. Update the flow diagram so audio model extraction is separate and partial outcomes occur only after eligible fallbacks.

Acceptance: real-extractor integration tests prove final outcomes and fallback call counts. Repeated/concurrent runs produce isolated, stable results without input mutation. Outstanding merge-policy cases are explicit blockers, not hidden behind passing fake-extractor tests.

### 6. Evaluate, correct, and hand off

- [ ] Run v2 on the frozen baseline cases. Separate source omissions, capture/cleaner losses, detector misses, wrong attribution, grouping errors, merge defects, and enrichment hallucinations.
- [ ] Have the user review the spreadsheet; retain corrections as sanitized regression fixtures and rerun affected cases. Report per-language and edge-case coverage, not just aggregate scores.
- [ ] Document callable setup, detector version, measured runtime, known limitations, and the evidence/enrichment adapter contract. Keep ordinary logs free of full private captions/transcripts; review artifacts are local and must not contain credentials.

Acceptance: required fixtures and focused integration tests pass; reviewed defects are resolved or explicitly recorded as release blockers. No score automatically authorizes production replacement.

## Verification

Add focused tests under `services/api/tests/` for extractor contracts, HTML/text detection, provenance, and real-orchestrator integration. Use sanitized fixtures and explicit expected facts rather than tests that merely repeat detector rules. Test idempotence, absence of network/model calls in the extractor, malformed HTML, large bounded inputs, and stable references. Define input size/block-count limits before implementation and report limit exhaustion as an operational input failure rather than silently truncating into a partial recipe.

Run from `services/api` after the named tests are added:

```sh
uv run pytest tests/test_extractor_v2.py tests/test_extractor_v2_evidence.py tests/test_extraction_orchestrator.py tests/test_extraction_language.py tests/test_html_cleaner.py tests/test_gemini_extraction.py
uv run pytest
```

Run from repository root:

```sh
uv run --project services/api pytest tools/instagram-fixture-capture/test_fixture_payload.py tools/extraction-review/test_review_runner.py
git diff --check
```

Model-backed evaluation is a separate, explicitly configured run. Record actual commands, case hashes, results, and environment blockers; do not mark unrun checks as passing.

## Release dependencies beyond this extractor task

The extractor can be complete and usable locally before production replacement. The wider extraction-v2 release additionally requires:

- One final enrichment handoff that cannot overwrite canonical facts or invent missing amounts/steps/times/temperatures. Generate an overview only from supported steps. Preserve unknown composition, incomplete nutrition, and uncertain allergens.
- Recipe evidence and issue persistence, authorized idempotent issue dismissal, and replay-safe worker persistence. Dismissal removes only the chosen code and does not make missing content available.
- Complete/partial/failed web and mobile states, source inspection, explicit linked-component import, no cooking mode without steps, and all new strings in en/pl/de/fr/es.
- Typed worker error mapping including `LANGUAGE_UNDETERMINED`, retry behavior, live acquisition parity with fixtures, verified creator comments, and DNS/redirect-safe bounded fetching. The current literal-IP URL check alone is not sufficient protection against hostnames resolving to private addresses.
- An explicit setting for new-import routing, user approval after manual review, and rollback to legacy for subsequent imports. Do not silently retry v2 failures with the legacy extractor or rewrite existing recipes.

Create a separate detailed integration plan before implementing those persistence/UI/rollout tasks. Keep this plan under `docs/specs/` until its extractor implementation and verification are complete, then move it to `docs/specs/completed/`. Include this plan in any eventual user-approved implementation commit.
