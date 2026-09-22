# Manual orchestrator v2 review setup

Status: implementation in progress. The offline envelope-review runner, fixture-backed linked pages, artifacts, and workbook sheets are implemented. Saved-transcript live/replay adapters and deeper per-decision orchestration observation remain pending. Keep this plan here until implementation and verification are complete, then move it to `docs/specs/completed/`. Include it in the eventual implementation commit; commit only after the user confirms completeness and correctness.

## Goal

Provide a local Python CLI that accepts one or many captured source JSON files, calls the real `ExtractionOrchestrator` with the real `RecipeEvidenceExtractor`, and exports a readable Excel workbook showing what happened. The reviewer must see the original URL, detected languages, exact parser inputs, extractor outputs, fallback decisions, final recipe, and errors without having to interpret console logs.

Use saved `audio.transcript` text when the orchestrator reaches its transcript fallback. Never download media or transcribe again. A captured transcript is source material, not an already extracted recipe: the existing Gemini audio-evidence adapter still performs model-based recipe extraction from that text.

This implements the orchestrator-review portion of [Extractor v2](extractor-v2.md). Legacy comparison, enrichment, nutrition, amount parsing, production routing, persistence, and application UI remain separate work. The phrase “parser input” here means the exact cleaned HTML or normalized text passed to `ExtractorV2`, or the transcript plus retained recipe passed to the audio-evidence model.

## Findings from the current code

- Captures already match the [version 1 input contract](extraction-orchestrator-input.md). Pass the envelope into `ExtractionOrchestrator.extract`; do not manually extract its HTML and bypass orchestration.
- The requested `services/api/tests/captured-payloads/html-cooking-nytimes-com-recipes-11111-rigatoni-with-white-bolognese.json` is an HTML envelope with roughly 670,000 characters of raw HTML. Social envelopes in the same directory include `audio.transcript`; an inspected example has a nonempty transcript and complete capture status.
- `tools/extraction-review/run_review.py` already exports XLSX using installed `openpyxl`, but takes a manifest of prepared inputs and calls `RecipeEvidenceExtractor` directly. Its six-column index does not expose orchestration, languages, intermediate results, or usable recipe review columns. Preserve that existing mode while adding envelope review.
- `ExtractionDependencies` already supports injection of the real extractor, language detector, linked-page provider, and audio-evidence extractor. Set `transcription_provider=None` in every review mode.
- The orchestrator already skips later fallbacks when ingredients and instructions exist, and prefers a supplied transcript over transcription. Description and verified creator comments are currently extracted together, not in separate passes.
- Outcomes expose evidence, per-evidence language code/confidence, and trace events. They do not preserve every extractor call/result, merged recipe snapshot, or explicit completeness decision. Add narrowly scoped diagnostics rather than duplicating the orchestration algorithm in the CLI.
- `GeminiAudioEvidenceExtractor` delegates to `gemini.extract_audio_recipe_evidence`. The latter currently returns validated data and hides the original request/response boundary; exact model diagnostics need an optional recording hook at that boundary.
- `failed-urls.json` also exists in the capture directory and is not a source envelope. Discovery must account for capture bookkeeping files.
- Existing extractor/orchestrator/review files have uncommitted work. Extend it carefully; do not replace or revert unrelated changes. The referenced `C:/Users/kules/.claude/CLAUDE.md` was unavailable during planning.

## CLI and operating modes

Extend `tools/extraction-review/run_review.py` with positional input paths (files, directories, or quoted globs expanded by Python, including on Windows). Envelope inputs and the existing `--manifest` mode are mutually exclusive. Discover directory JSON files nonrecursively, sort deterministically, and deduplicate resolved paths. Skip known capture bookkeeping files during directory discovery and record those skips; an explicitly supplied invalid file must produce an error row. Empty discovery is a usage error. Do not require users to build a manifest for ordinary captures.

Proposed commands from repository root:

```powershell
# One captured page; fully offline by default.
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads/html-cooking-nytimes-com-recipes-11111-rigatoni-with-white-bolognese.json

# Batch; the CLI expands the glob on Windows.
uv run --project services/api python tools/extraction-review/run_review.py "services/api/tests/captured-payloads/*.json" --output .local/extraction-review

# Saved transcripts are processed with Gemini by default when earlier stages are insufficient.
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads

# Replay previously recorded transcript extraction without network access.
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads --audio-model replay --recordings .local/extraction-review/previous-run --resume-from .local/extraction-review/previous-run/review.xlsx
```

Modes:

- Default `--audio-model live`: use the existing Gemini audio-evidence implementation on saved transcript text only. Never transcribe or enable live page fetching. Record each request and response diagnostic; an individual audio-evidence call is limited to 45 seconds and retries one transient provider failure.
- `--audio-model off`: deterministic extraction and language detection work offline. If the transcript fallback is needed, explicitly mark the review as limited by `AUDIO_MODEL_DISABLED`; do not present this as evidence that the transcript lacks a recipe.

Linked pages use a fixture-backed `LinkedPageProvider`. Index HTML envelopes by exact source URL from the selected inputs and an optional `--linked-fixtures <directory>`. Strip fragments for matching but preserve query strings; any aliases must be explicit in a small optional mapping file. Never guess that two different URLs are equivalent or fetch a missing snapshot. Record `LINKED_SNAPSHOT_MISSING`, allow the orchestrator's normal fallback to continue, and show the limitation separately from its returned failure code. The provider preserves requested/final URL information where available; otherwise use the captured URL without inventing redirect history.

No recipe saving, database, browser authentication, or running API server is required. Import application settings only when necessary for live model execution; offline setup must not require database credentials or a Gemini key.

## Instrumentation and ownership

1. Assemble real `RecipeEvidenceExtractor`, `LinguaLanguageDetector`, fixture page provider, and selected audio-model adapter inside the review runner. Call the orchestrator once per input. Do not modify fixture contents or strip comments/transcripts to simulate a desired route.
2. Add recording decorators around extractor/provider calls. Save exact `ExtractionInput` including evidence IDs/spans, HTML after cleaning, raw extractor return values before orchestrator validation/link resolution, durations, and sanitized exceptions. Audio calls save the exact `AudioExtractionInput`, including retained partial evidence, and the adapted extractor result.
3. Add an optional per-run diagnostic observer to orchestration. Emit ordered snapshots at language decisions, extractor validation, accepted/rejected merges, completeness checks, fallback selection/skips, and final classification. Record both the candidate result and the accumulated recipe after each merge. A no-op observer leaves existing behavior unchanged; no global monkeypatching or capture state.
4. At the existing Gemini request boundary, optionally record the actual system instruction, serialized content, model/settings/schema, response text, validation outcome, usage when supplied by the SDK, latency, and retry/error metadata. Preserve the existing extraction function's public return contract. Do not reconstruct a guessed prompt in the report or label validated output as the raw response.
5. Keep diagnostics local to the runner/observer. Report-writing failure must be a visible runner error, not an extraction failure or an unnoticed loss of evidence. Flush each completed case before moving on.

Do not alter extraction heuristics, merge rules, language thresholds, or stage order to improve the report. Record discovered defects for follow-up. Current broad exception mappings can mislabel deterministic parser exceptions as `INVALID_MODEL_RESPONSE`: retain the actual orchestrator code and separately show exception type/origin rather than concealing the mismatch.

## Report contract

Default output is `review.xlsx` with filters, frozen header/identity columns, wrapped text, sensible widths, readable status coloring, and safe links to local artifacts. Add optional `--csv` to export each sheet as a separate UTF-8 BOM CSV; XLSX is the main review format.

### Summary: one row per input

| Columns | Meaning |
| --- | --- |
| `case_id`, `input_file`, `input_sha256`, `source_url`, `kind` | Stable source identity and exact fixture version; preserve the original URL including query parameters. |
| `capture_status`, `capture_errors` | Source collection problems, separate from extraction failures. |
| `review_status`, `review_limitations` | `finished`, `limited`, or `runner_error`; missing snapshots, disabled model, replay misses, and budget exhaustion remain visible. |
| `outcome`, `issue_codes`, `failure_reason`, `failed_stage` | Exact orchestrator outcome: complete, incomplete, or failed. Never equate `MISSING_INSTRUCTIONS` with a terminal error. Blank when the runner could not obtain an outcome. |
| `detected_languages`, `language_details` | Ordered distinct detected codes plus evidence ID/code/confidence pairs. Explicit `undetermined` values; do not force multilingual evidence into one code or detect language independently for reporting. |
| `completed_at_stage`, `completion_sources`, `decision_reason` | First completeness checkpoint with both ingredients and instructions, actual contributing evidence kinds, and the recorded decision. Use `not_complete` if none. |
| `transcript_available`, `transcript_used`, `transcript_status`, `fallback_reason` | Distinguish absent transcript, skipped because already complete, disabled model, replay miss, language rejection, processing failure, and successful use. |
| `title`, `ingredient_groups`, `ingredients`, `instructions` | Readable final recipe content with groups and ordering preserved; full evidence remains in the detail sheets/artifacts. |
| `stage_errors`, `duration_ms`, `model_calls`, `artifact_path` | Include errors recovered by later fallbacks, not just terminal failures. |
| `review_verdict`, `error_category`, `reviewer_notes`, `expected_correction` | Editable manual assessment, preserved when rerunning the same fixture hash. |

Examples of `completed_at_stage`: `html`, `social_text`, `linked_page`, `transcript_model`, `not_complete`. Examples of `completion_sources`: `caption`, `caption + creator_comment`, `caption + transcript`, `linked_page`.

Compute completeness and contribution summaries from recorded decisions and accepted recipe evidence IDs. A social-text call includes caption and comments together; caption-only attribution means the returned facts use only caption evidence, not that a separate caption-only experiment was run. An attempted but rejected linked page must not be reported as contributing to the recipe. “Complete” means the orchestrator found both sections; it is not a quality score or proof that every source fact was captured.

### Stages: one row per ordered event/call

Columns: case ID, sequence/call ID, stage, action/status, evidence IDs, source URL, detected language/confidence, exact input preview/artifact, candidate extractor output preview/artifact, accepted/validated output, accumulated recipe preview/artifact, ingredient/instruction presence, decision/fallback reason, failure code, exception type/message, duration. Include HTML cleaning, comment exclusions, normalization, linked-page failures, skipped fallbacks, and final classification. Do not fill outputs for stages that never ran.

### Evidence: one row per source segment

Columns: case ID, evidence ID/kind, source URL, creator verification/exclusion reason, source text, normalized text/span where applicable, detected language/confidence, whether evaluated/used, artifact path. Excluded or unvisited evidence has no invented language result. This lets the reviewer compare source content with exactly what reached extraction.

### Recipe items and model calls

`Recipe items`: one row per final ingredient or step, with component/group, order, original wording, evidence IDs, quotes/locators, and component links. Keep partial candidates in Stages even when final validation fails.

`Model calls`: one row per attempt with live/replay status, actual model/prompt version, request and response previews/artifacts, latency, usage if available, and errors. Empty when no model ran. Do not estimate unavailable cost or token counts.

## Artifacts, reruns, and failure handling

- Create a unique run directory under `.local/extraction-review/` by default; add that generated location to `.gitignore`. Never overwrite a previous workbook, captured fixture, or review notes.
- Store a versioned `run.json` with CLI options, timestamps, code revision/dirty-state marker, relevant code hashes (uncommitted code matters), package versions, ordered inputs/hashes, mode, discovery skips, and final run status. Do not dump environment variables or secrets.
- Write one full JSON result per case, raw input snapshot, exact cleaned/normalized input files, model recordings, and merge snapshots as needed. Use generated/hash-based filenames, never arbitrary case IDs as filesystem paths. Stable case ID derives from repository-relative input path; content SHA-256 identifies the reviewed version. External files use a documented normalized-path identity.
- Spreadsheet cells contain readable content up to a documented preview limit, followed by a truncation marker and artifact reference. Excel allows only 32,767 characters per cell: full data must remain in sidecars. Escape invalid spreadsheet control characters only in previews; never lose or silently modify canonical JSON/text evidence.
- Write source-derived cells as literal strings and protect CSV against formula injection, including formula prefixes after whitespace/control characters. Only explicit safe HTTP(S) URLs and generated local artifact links become hyperlinks. Never serialize API keys, auth headers, or credentials into diagnostics.
- `--resume-from` copies review columns by case ID plus matching input hash; changed inputs receive a visible “previous review applies to a different input” marker rather than stale approval. It does not skip processing. Reusing paid results requires explicit replay mode and a matching request hash. Repair/test the current `load_notes` implementation, which reads `.value` from rows already returned with `values_only=True`.
- Continue after per-file malformed JSON, invalid envelopes, provider failures, and unexpected exceptions. Separate runner errors from actual orchestrator outcomes. Preserve `UNSUPPORTED_LANGUAGE` and the code/confidence from the rejecting evidence even when extraction never ran.
- After interruption, keep completed case artifacts and regenerate the workbook from them; report the run as interrupted. Use atomic file replacement within the unique run directory. Repeated/concurrent CLI invocations have isolated outputs and no shared mutable state; deduplicate repeated paths within a run. Separate live invocations are separate paid experiments, stated in the CLI help.
- Exit `0` when review execution finishes without harness limitations/errors (recipe incompleteness or extraction failure is a valid review result), `1` for limited/errored/interrupted execution with usable artifacts, and `2` for invalid invocation/setup. Print counts and the workbook path.

## Implementation tasks

Use a branch/worktree and bounded build/check/fix tasks, with at most three repair iterations per task before reporting unresolved issues. Follow the repository's implementation workflow when implementation is requested. This document authorizes no implementation or paid evaluation by itself.

1. **Input loader and CLI:** extend the existing runner without breaking legacy manifest use; add discovery/validation, case IDs/hashes, unique output directories, and fixture-linked-page indexing. Keep CLI, execution/recording, and report formatting in focused modules under `tools/extraction-review/`.
2. **Real orchestration and diagnostics:** inject the real dependencies; add recording wrappers and optional observer; record explicit completeness/merge/fallback decisions without changing policies. Guarantee no transcription provider is installed.
3. **Saved-transcript model modes:** add off/live/replay wiring, exact Gemini request/response recording, attempt budget, timeout handling, and explicit limitation reporting. Load live configuration lazily.
4. **Reports and reruns:** add Summary, Stages, Evidence, Recipe items, and Model calls sheets; readable previews/full artifacts, CSV export, reviewer-note preservation, interruption recovery, and ignored generated output.
5. **Verification and documentation:** test the scenarios below, document setup and real commands in the existing README, run the named HTML fixture plus available social fixtures, and record limitations. Model-backed manual runs are separate from offline tests. Update this plan and the backlog with actual verification evidence.

## Acceptance criteria and verification

### Verification evidence (2026-09-20)

- `uv run --project services/api pytest tools/extraction-review/test_review_runner.py services/api/tests/test_extraction_orchestrator.py` passed (11 tests).
- The offline runner completed the NYT Marcella Hazan capture and produced a five-sheet workbook with raw-envelope and result sidecars under `.local/extraction-review-test/`.
- A Polish social capture completed as a limited review because it had a saved transcript and offline audio extraction is intentionally disabled. This confirmed that no transcription or network fallback was attempted.
- The API regression suite discovers every captured envelope and runs it offline through the real v2 cleaner, language detector, extractor, and orchestrator. Captures start as passing execution checks; manually approved fields are added as exact expectations in `services/api/tests/fixtures/extraction_v2/expectations.json`.

The audio live/replay, exact Gemini request recording, legacy-manifest compatibility, and observer-level merge snapshots described below are still outstanding and must be implemented before this plan can move to `completed/`.

- Single path, multiple paths, directory, Windows quoted glob, duplicate path, and empty discovery behave as specified; every explicitly supplied bad JSON/envelope gets a visible result without preventing valid cases from running.
- The named NYT fixture passes through the real cleaner, detector, extractor, and orchestrator. Its exact cleaned input and extracted facts are inspectable; no expectation that an unreviewed page necessarily extracts correctly.
- Complete caption skips linked pages and transcript model; caption plus verified comments reports both when they contribute; excluded viewer comments cannot become evidence.
- Partial caption plus frozen linked HTML follows the real linked-page route. Partial caption plus saved transcript passes retained evidence into the audio model and records the merged result. No media/transcription call is made even if the fixture contains video/audio URLs.
- Missing transcript, missing linked snapshot, disabled model, replay mismatch, budget exhaustion, timeout, malformed model response, and an intermediate error followed by success are distinct in the report.
- Supported-language examples cover en/pl/de/fr/es; unsupported-language and undetermined-language fixtures preserve the actual gating result and prevent the relevant extractor call. Mixed evidence languages remain separately visible.
- Partial recipes, empty/no-recipe outcomes, and failed validation retain correct issue/failure codes and available diagnostics. Diagnostic observation does not change results or provider call order; verify observer enabled/disabled parity on representative flows.
- Offline and replay tests prohibit network access. Live model tests use a fake SDK transport; no paid API calls in automated checks. Verify model-attempt budgets include retries.
- Workbook tests reopen generated XLSX and inspect columns, multiline Unicode, formulas, long HTML, artifact links, and retained review notes. Test two isolated runs and a recoverable interrupted run. CSV previews and full artifacts must remain attributable to the same case/input hash.

Planned commands from repository root (new test files added during implementation):

```powershell
uv run --project services/api pytest tools/extraction-review/test_review_runner.py tools/extraction-review/test_orchestrator_review.py tools/extraction-review/test_review_report.py
uv run --project services/api pytest services/api/tests/test_extraction_orchestrator.py services/api/tests/test_extraction_language.py services/api/tests/test_extractor_v2.py services/api/tests/test_gemini_extraction.py
git diff --check
```

Completion means the reviewer can open the workbook and assess source-to-result quality and routing for supplied fixtures, with full artifacts available for long content. It does not constitute user approval of extraction quality or approval to replace the production pipeline.
