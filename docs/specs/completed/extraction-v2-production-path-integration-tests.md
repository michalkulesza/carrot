# Extraction v2 production-path integration tests

Status: implemented and verified locally; awaiting user review before commit. This verifies the already-implemented production cutover; it does not add a second extraction path or change release behavior.

## Agreed seams

The user approved tests at the live import boundaries: `acquire_and_extract_url` / `extract_pasted_text`, followed by the import-job result and saved recipe where a test database is available. Exercise the real production dependency assembly, v2 orchestrator, evidence-to-enrichment handoff, and worker mapping. Assert observable outcomes and stored/source-backed facts, not private helper calls or model wording.

External HTTP, ScrapeCreators, transcription, Gemini, and clock/network safety resolution may be replaced with deterministic test doubles. Do not mock the v2 extractor, orchestrator, merge, or worker handoff under test. Never make live provider requests from the suite.

## Vertical test slices

1. Start with one frozen HTML capture through production acquisition. Assert its final URL, complete/partial outcome, original-language ingredients and steps, and evidence references. Add a frozen Instagram caption case through the real production composition root; a complete caption must not fetch a linked page or call transcription/audio.
2. Cover a partial Instagram caption that names a full-recipe link in either the caption or a verified creator comment. Use a local HTML response and assert the linked page is merged before audio. A viewer-authored link must not contribute facts. Cover a transcript fallback with a frozen audio response and no live Gemini.
3. Cover the production handoff for saved-incomplete and failed imports: an incomplete result retains source facts, URL, issue code and evidence; a no-content or unsupported-source result does not create a recipe and exposes its typed failure. Confirm repeated processing does not create duplicate recipes. Prefer a test database and the public import/job interface. If database-backed tests cannot run in this environment, do not replace them with assertions on private helpers; document the limitation and leave the persistence slice open.
4. Run focused tests and the relevant API suite. Verify `git diff --check`. Review the test diff for network leakage, fixture tautology, and accidental reliance on exact Gemini phrasing. Update the cutover plan's verification status to reflect only checks actually completed.

## Acceptance

- The test suite is offline by default and fails if an unexpected external client is used.
- HTML and Instagram examples pass through production assembly, not only the review harness.
- Source facts, provenance, fallback order, partial/failure semantics, and duplicate-job safety are tested where the required seams are available.
- Any unavailable database or provider scenario is called out honestly rather than marked passing.
- Do not commit until the user confirms the change is complete and correct; include this plan in that commit.

## Verification record (2026-09-23)

- `services/api/tests/test_extraction_v2_production_path.py` now exercises captured HTML through production HTTP acquisition, deterministic Instagram caption/link and frozen transcript cases through ScrapeCreators acquisition, and import-job persistence through a disposable pgvector/Postgres database.
- The worker checks use `CARROT_ISOLATED_TEST_DATABASE_URL`; without it, the two database tests skip in normal CI. The test refuses the app's default port and requires a local database named `carrot_extraction_v2_test_*`. The disposable `pgvector/pgvector:pg16` container used for the final run was `carrot-extraction-v2-it-20260923b` at `127.0.0.1:32769`. It was stopped and auto-removed afterward. The running `carrot-db-1` was not used.
- Isolated-DB check: `$env:CARROT_ISOLATED_TEST_DATABASE_URL='postgresql+asyncpg://test:test@127.0.0.1:32769/carrot_extraction_v2_test_20260923b'; uv run --project services/api pytest services/api/tests/test_extraction_v2_production_path.py services/api/tests/test_extraction_orchestrator.py services/api/tests/test_extraction_v2_captured_payloads.py services/api/tests/test_hybrid_extraction_integration.py services/api/tests/test_import_thumbnails.py -q --tb=short --disable-warnings` → 138 passed, 40 skipped. Seven of the passes were the original production-path tests, including both real Postgres worker cases. Two additional offline failure-path tests were then added.
- Final full API check without a database override: `uv run --project services/api pytest services/api/tests -q --tb=short --disable-warnings` → 328 passed, 42 skipped. The 42 skips comprise 40 existing audio captures without frozen model responses and the two database tests that require an isolated URL. No live provider requests were made.
- The full-suite run first exposed 16 tests calling the removed legacy URL/text pipeline. Obsolete private-helper, model-override, and old manual-completion assertions were removed; still-current no-content and social-fetch failure behavior was ported to production-path tests. The two allergen-flow assertions were ported to `enrich_v2_recipe` with an offline Gemini client. That migration exposed a real v2 defect: configured allergens raised `NameError` because `gemini.py` referenced the deleted `_ingredient_display`; the call now uses the existing `_source_ingredient_display` helper. The migrated allergen cases pass.
