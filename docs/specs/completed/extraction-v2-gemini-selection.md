# Gemini-assisted text selection for extraction v2

Status: implementation complete and verified locally. No commit or production rollout authorized. Live model accuracy evaluation remains a separate review step.

## Problem and scope

Instagram captions often contain recognizable ingredient lists but lack headings understood by the deterministic extractor. Use Gemini to select source lines for ingredients, instructions, component headings, and explicitly stated nutrition. Keep website HTML extraction deterministic and preserve the source-agnostic extractor boundary.

Use the hybrid text path by default for every nonempty Instagram/social text input in the review CLI, not only when deterministic extraction reports missing sections. The user requested this default after implementation; no extra enablement or paid-model approval flags are required. `--text-selector off` remains available for explicit offline comparisons. Do not switch legacy production imports to v2.

## Design

User-selected model: `gemini-3.1-flash-lite`, with a dedicated
`GEMINI_TEXT_SELECTION_MODEL` configuration independent of legacy extraction.

1. Number nonempty original text lines with stable IDs and retain exact character offsets into the immutable ExtractionInput. Preserve evidence-span boundaries and original ordering. Do not use ingredient/step recognition rules to filter Gemini-selected lines.
2. Request a strict structured selection: component heading IDs, ingredient line IDs, instruction line IDs, yield/portion line IDs, and nutrition selections. Permit disjoint lists, missing sections, and empty results. Omitted lines are ignored. Preserve each instruction paragraph/line as a step; no inferred ingredients, rewriting, or action splitting. Derive the serving count server-side from selected yield source text.
3. Validate IDs, types, duplicates, conflicting roles, source boundaries, and ordering. Build recipe evidence server-side from selected source text and compute resolvable references. Remove leading emoji/list markers from materialized ingredient and instruction text while retaining exact source-substring references. Never accept model-authored ingredient or instruction strings.
4. Gemini returns only the IDs of a coherent nutrition panel's source lines. The server deterministically identifies an explicit per-serving basis and parses calories, protein, fat, and carbohydrates from those selected lines. Store only source numbers in per-serving value fields while retaining the complete selected lines as raw text and evidence; do not accept model-authored values, estimate, convert, or divide by servings. Keep per-100g, whole-recipe, or unspecified-basis statements as raw evidence without mislabelling them per-serving, and avoid mixing conflicting nutrition panels.
5. Keep model selection injectable for offline tests. Reuse existing Gemini configuration/client patterns and usage accounting where applicable, with bounded request timeout/retries and no blocking synchronous model call in the async path. Avoid exposing recipe text in error logs.
6. Invalid responses or provider failures must be visible and recover safely via the deterministic text extractor, without merging partially validated model selections. Valid empty or incomplete results stay empty/incomplete so existing linked-page/audio fallbacks remain eligible. HTML never requires a Gemini call.
7. Default the review CLI to Gemini selection for social captures, including useful provider/fallback diagnostics. HTML and explicit `--text-selector off` runs must not require credentials or network access. Document the default behavior.

## Acceptance criteria

- Unusual headings, unquantified ingredients, interrupted lists, and multiple components are selected faithfully.
- Every extracted item references exact supplied source text, including caption plus creator-comment inputs and repeated identical lines.
- All five supported languages are covered by selector fixtures/prompts without translating source text.
- Nutrition is excluded from cooking steps and ingredients; absent nutrition stays absent. Grounded values and their stated basis survive extraction and existing merges.
- Explicit yield/portion lines populate grounded source text and a server-derived serving count and survive existing merges.
- Out-of-range IDs, model-authored nutrition values, duplicate/conflicting selections, malformed output, timeout, and provider failure are covered by meaningful offline tests.
- Ingredient-only captions remain incomplete; successful but incomplete deterministic extraction does not prevent hybrid selection when enabled.
- Deterministic HTML behavior and existing captured-payload outputs are preserved. Reviewed social expectations retain Gemini's line selections so those hybrid results can be replayed offline.
- No new frontend strings, migrations, production rollout, or commits.

## Implementation tasks and verification

- [x] Implement selection contracts, line indexing, validation, evidence materialization, and nutrition grounding.
- [x] Add bounded Gemini provider and hybrid extractor composition.
- [x] Wire an explicit hybrid review mode and document usage and failure diagnostics.
- [x] Add focused offline regression tests; run relevant extractor, orchestrator, Gemini, and review-runner suites.
- [x] Review diff, fix regressions, record test results and limitations, and update the backlog.

## Verification and handoff

GPT-5.6 Terra with medium reasoning implemented the initial selector and review integration. Parent review completed async cancellation/retry bounds, source-span intersections, per-serving nutrition safeguards, model/usage artifacts, and additional regression tests. The selector uses a 20-second total budget and no more than two requests; SDK-internal retries are disabled. The review CLI rejects the previously unused `--max-model-calls` flag rather than giving a misleading request cap; use `--limit` to bound cases.

From the repository root, the following passed: **217 tests** (one existing Google SDK deprecation warning).

```powershell
services/api/.venv/Scripts/python.exe -m pytest services/api/tests/test_gemini_text_selection.py services/api/tests/test_gemini_selection_provider.py services/api/tests/test_hybrid_extraction_integration.py services/api/tests/test_extractor_v2.py services/api/tests/test_extractor_v2_evidence.py services/api/tests/test_extraction_orchestrator.py services/api/tests/test_gemini_extraction.py services/api/tests/test_extraction_v2_captured_payloads.py services/api/tests/test_extraction_language.py services/api/tests/test_html_cleaner.py tools/extraction-review/test_review_runner.py tools/extraction-review/test_hybrid_review.py -q -p no:cacheprovider
```

`git diff --check` passed. Tests use injected selections and mocked Gemini clients: they verify grounding, ordering, grouping, Unicode preservation, nutrition handling, asynchronous provider failure behavior, source attribution, concurrent diagnostic isolation, linked-page merges, and actual JSON/Excel review artifacts. They do not establish live model selection accuracy. No paid model calls, production changes, or fixture/expectation rewrites were performed for this feature. Existing user changes remain in place.

A live review then exposed two integration defects. The provider now removes Pydantic's unsupported `additionalProperties` fields from the Gemini `response_schema` while keeping strict local validation. Materialization removes leading emoji/list markers from ingredient and step text and stores numeric-only per-serving nutrition values; exact source substrings and the full raw nutrition line remain available as evidence.

Reviewed hybrid expectations store the selected source line IDs so the offline captured-payload suite can replay Gemini's semantic selection without a model call. Yield and nutrition values are then parsed deterministically from those lines. The deterministic text extractor also recognizes straightforward explicit serving/portion metadata in English, Polish, German, French, and Spanish.

To evaluate live, configure `GEMINI_API_KEY` and follow `tools/extraction-review/README.md`; social captures use Gemini automatically. Nutrition classification and component membership remain model judgments; validated references guarantee source grounding, not semantic correctness. One selected line is one item/step; inline splitting and inferred recipe facts are outside scope.

Use the Ralph implement/check/fix workflow: work on `feat/extraction-v2-gemini-selection`, save progress in this plan and the working tree, and limit the initial implementation loop to three test/fix iterations or 30 minutes. Stop and report after repeated identical blockers or missing decisions. The parent reviews the implementation and test changes before completion. A Ralph-specific runner/skill is not available in this session; perform this bounded loop directly.

Preserve all pre-existing user changes. Move this plan to `docs/specs/completed/` only after implementation and verification are complete, and include it in any eventual user-confirmed commit.
