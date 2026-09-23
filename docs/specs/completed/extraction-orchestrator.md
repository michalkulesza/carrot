# ExtractionOrchestrator implementation plan

Status: complete. The orchestrator implementation and production integration are complete. TikTok fixture evaluation remains tracked separately in [the Extractor v2 plan](../extractor-v2.md).

## Goal and scope

Implement a source-aware `ExtractionOrchestrator` that turns a versioned social or raw-HTML payload into a complete, incomplete, or failed extraction outcome, ready for enrichment. Preserve supported source facts and their provenance while choosing the minimum necessary fallback work.

Requirements come from [the extraction v2 backlog](../TODO.md). Reuse the [version 1 input contract](extraction-orchestrator-input.md), the completed [HTML cleaner](completed/html-cleaner.md), and [fixture capture tool](completed/instagram-fixture-capture.md).

This task delivered validated contracts, source adapters, authorship checks, language gating, orchestration, evidence merging, diagnostics, tests, and production integration. `ExtractorV2` detection is source-agnostic; audio recipe detection remains a separate model-backed dependency, not a deterministic transcript parsing requirement.

Image imports, standalone text-import migration, unit/amount parser v2, existing-recipe re-extraction, automatic component imports, translation, and broader-page Gemini recovery are outside this task.

## Existing implementation and gaps

| Location | Reuse or required change |
| --- | --- |
| `services/api/src/api/services/scraper.py` | Reuse `parse_scrapecreators_reel_response`. `ReelMetadata` currently contains description, creator handle, links, thumbnail, and video URL, but no comments/authorship records. Production acquisition must preserve the raw response in the same envelope as fixtures. |
| `tools/instagram-fixture-capture/fixture_payload.py` | Existing v1 social/HTML builders, capture status, and optional saved transcript establish compatibility fixtures. |
| `tools/instagram-fixture-capture/capture_instagram_fixtures.py` | Comment records contain `author_handle`, `is_creator_authored`, `authorship_evidence`, and nullable comment/parent IDs. Verify ownership from identities rather than accepting the Boolean alone. |
| `services/api/src/api/services/html_cleaner.py` | Call `clean_html_body(raw_html)` before every HTML extraction, including linked pages. Keep raw snapshots for comparison. |
| `services/api/src/api/services/pipeline.py` | Legacy flow mixes acquisition, extraction, completeness, and enrichment. `_try_linked_url` discards partial results; `_strip_html` flattens/truncates content. Neither is the v2 extraction path. |
| `services/api/src/api/services/transcription.py` | Reuse `transcribe_video` behind an injected transcription dependency. Prefer an existing fixture transcript when audio fallback is reached. |
| `services/api/src/api/services/gemini.py` | `extract_recipe` immediately enriches extracted content. Do not use it for intermediate v2 stages. Expose a separate validated audio evidence extraction operation. |
| `services/api/src/api/models.py`, `services/api/src/api/services/import_worker.py` | Current job failures use broad lowercase codes; worker persistence expects `ImportResult`. Introduce v2 internal outcomes without silently changing that public contract. |

## Contracts and ownership

Create focused modules under `services/api/src/api/services/extraction_v2/`: `contracts.py`, `sources.py`, `language.py`, `merge.py`, and `orchestrator.py`. Keep the public class `ExtractionOrchestrator` in `orchestrator.py`. Add adapters only where a real dependency requires them.

### Input

- Validate a discriminated union with `schema_version: 1`, `kind: social | html`, `source_url`, and capture metadata. Reject unknown versions, unsupported kinds, and malformed required fields with `INVALID_INPUT` before external work.
- Preserve compatibility with current fixture builders, including `captured_at`, nullable IDs, absent creator identity, optional media, and recorded capture/transcription failures. Treat unavailable optional data differently from malformed required data.
- `capture.status` describes acquisition, not recipe completeness. A partial capture can still contain a complete recipe.
- Live source acquisition and local fixture loading produce the same envelope. The orchestrator does not acquire browser sessions or accept browser credentials.
- Inject a linked-page provider, transcription provider, language detector, source-agnostic extractor, audio evidence extractor, and trace recorder. An offline provider reads frozen snapshots and never silently fetches live URLs.

### Source-agnostic extraction boundary

Define async protocols for `extract_html(cleaned_html)` and `extract_text(normalized_text)`. Their results contain recipe candidates/selected facts, ordered ingredient groups and steps, original wording, links, and locators into the exact supplied input. Any IDs supplied for traceability are opaque; platform names, creator verification, source ordering, and fallback policy stay outside `ExtractorV2`.

The orchestrator keeps a sidecar source registry and maps locators to source records. For combined caption/comment text, retain segment boundaries and a normalization offset map so an extracted fact can be traced to the original comment or caption. Normalize line endings and whitespace conservatively; retain headings, punctuation, quantities, and order. Never translate.

Each evidence record needs a stable source ID, source kind, URL, original text or snapshot reference, author verification where applicable, language result, and locator. Each selected fact references evidence IDs; competing facts retain their evidence and a selection rule. Resolve relative HTML links against the fetched page's final URL without changing canonical source wording.

### Outcome

Return a validated discriminated union:

| Outcome | Required content |
| --- | --- |
| `complete` | Ingredients and instructions for the selected recipe; empty missing-content codes. |
| `incomplete` | At least one usable ingredient or instruction; `MISSING_INGREDIENTS` or `MISSING_INSTRUCTIONS`, computed from actual evidence. |
| `failed` | No saveable recipe, or a terminal policy failure such as unsupported language; closed reason code and failing stage. |

All outcomes include source metadata and stage diagnostics. Complete/incomplete outcomes include canonical evidence and uncertainty markers for downstream enrichment. Missing amounts do not make an ingredient absent. Empty groups, whitespace, or a generated overview do not count as instructions.

The orchestrator returns evidence; it does not save recipes or run enrichment at each stage. Its caller enriches one final usable outcome and persists it once. Enrichment must not fill absent quantities, instructions, temperatures, or times. Unknown component composition and insufficient quantities must remain explicit uncertainty.

## Execution rules

### Language gate

Before recipe extraction, identify the language of each eligible source segment: cleaned website text, caption, verified creator comment, or transcript. Initially allow en, de, pl, fr, and es. Preserve detected language and source URL in diagnostics.

Do not inspect excluded viewer comments or fetch otherwise unnecessary sources just to detect language. A confidently unsupported eligible source terminates with `UNSUPPORTED_LANGUAGE`; do not translate it or continue a lossy extraction. Transcription can precede transcript language detection, but model recipe extraction cannot.

Use an injectable language detector. The initial implementation uses offline `lingua-language-detector`, which evaluates all of its languages before Carrot applies its supported-language policy; restricting detector candidates to the five supported languages would misclassify unsupported content as a supported language. The MediaPipe alternative requires a separately managed `.tflite` model asset in addition to its Python package. Text shorter than 20 non-whitespace characters is language-neutral `unknown` and may proceed; substantive text with a confidence below 0.25 returns backend `LANGUAGE_UNDETERMINED`. Mixed supported languages retain their original wording; a confidently unsupported substantive segment follows the unsupported-language rule.

### Raw HTML

1. Validate input and retain its snapshot identity and source metadata.
2. Run `clean_html_body`, then language detection on the resulting content.
3. Call `ExtractorV2.extract_html` with cleaned HTML only.
4. Attach provenance and classify the result. The extractor chooses the main recipe, or first recipe in document order when no main recipe is clear.
5. Return complete/incomplete evidence, or structured failure. Do not ask Gemini to recover content from the broader page and do not automatically follow component links.

### Social

1. Parse the raw response through the existing ScrapeCreators parser. Retain creator identity, canonical/source URL, caption, media references, and candidate links.
2. Independently verify comment/reply authors against the post owner. Prefer matching stable platform IDs when available; otherwise require exact platform-normalized handles. Conflicting IDs fail verification even if handles match. Missing identity, display-name similarity, a pinned comment, or the fixture Boolean alone is insufficient. Replies are checked individually.
3. Preserve caption order followed by verified creator comments in stable captured order. Deduplicate repeated captured comments by ID, or exact author/text identity when IDs are absent. Keep exclusions and their reasons in diagnostics.
4. Language-check eligible text, normalize with provenance mapping, and call the text extractor. Skip an empty input. If ingredients and instructions exist, finish immediately without fetching links or processing audio, even when a fixture already contains a transcript.
5. When incomplete, try eligible full-recipe links in stable source order. Each fetched page passes through cleanup, language gating, and HTML extraction. Retain partial results and reassess combined evidence after each eligible merge. Stop once complete.
6. If still incomplete, use the saved transcript or lazily transcribe available video. Pass the transcript plus retained evidence to the dedicated Gemini recipe detection/extraction operation. It must detect ingredients, instructions, both, or neither without requiring prior deterministic transcript recognition.
7. Validate the model output and its evidence references, apply merge/conflict rules, and classify the final result. After applicable fallbacks are exhausted, return partial evidence with its missing-content code; return failure when no supported recipe content exists.

### Links, merges, and bounded work

- Follow only links identified in creator-controlled evidence as the full recipe for the current dish. Preserve component/sauce links as ingredient references for an explicit later user import. Do not crawl profiles, related recipes, or recursively follow links from fetched pages.
- Proposed initial limits: three distinct full-recipe candidates, one audio fallback, and one extraction per unique input in a run. Record skipped links and limit exhaustion. Make these named policy settings so evaluation can justify changes.
- Validate HTTP(S) destinations and every redirect, blocking local/private network targets. Bound redirects, response size, and fetch duration. The current legacy fetch helper is not a sufficient safety contract by itself.
- Merge only evidence confidently associated with the same recipe. A linked page containing several recipes follows the main/first selection rule, but must still match the social recipe before its facts can be combined. Uncertain identity is recorded and skipped; never combine two dishes to manufacture completeness.
- Preserve complementary sections and groups. Deduplicate only grounded duplicates, retaining all supporting evidence; do not collapse same-named ingredients in different groups.
- Explicit, grounded creator corrections override the corrected fact. Otherwise caption/description wins over conflicting audio. Retain both values and the applied rule, without requesting user review for that resolved disagreement. Never process audio merely to search for conflicts.
- Proposed tie-break for other unresolved conflicts: retain the earlier supported fact in stage order and record the alternative; ordinary creator comments fill gaps unless an explicit correction is established. Ambiguous correction targets are not applied. Validate this policy against reviewed examples before production integration.

## Failures, retries, and diagnostics

Use separate enums for saved-recipe issues, model-selectable content failures, and backend operational failures. Model-selectable terminal content reasons are `NO_RECIPE_CONTENT`, `AMBIGUOUS_RECIPE`, and `UNREADABLE_CONTENT`. Multiple recipes alone do not imply ambiguity. The backend owns `INVALID_INPUT`, `UNSUPPORTED_LANGUAGE`, `SOURCE_FETCH_FAILED`, `TRANSCRIPTION_FAILED`, `MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `INVALID_MODEL_RESPONSE`, and `UNKNOWN_ERROR`; finalize uncertain-language handling as described above.

Unknown model codes, malformed output, unsupported evidence references, and contradictory result shapes become `INVALID_MODEL_RESPONSE`, never arbitrary UI text. Cancellation propagates without starting another fallback. Ordinary intermediate acquisition/model failures are recorded and allow eligible later stages. Do not discard already usable partial evidence after a later operational failure. Unsupported language remains a terminal policy failure.

If no evidence survives, prefer the last eligible operational failure that prevented extraction over `NO_RECIPE_CONTENT`; otherwise retain a validated content failure. Keep the complete stage history so this summary does not erase earlier causes. Mark retryability from typed backend failures, not exception-message matching.

Keep v2 reason and stage separate from existing `ImportFailureCode`. The future worker adapter can map content failures to `user_action_required`, invalid input to `invalid_input`, and operational failures to existing job retry/failure behavior while persisting the detailed v2 reason. Add dedicated client handling for unsupported language before rollout. Partial outcomes must reach recipe persistence rather than the legacy failed-import branch.

Use run-local state and deduplicate repeated links/transcription work. Repeated orchestrator calls must not mutate fixtures, accumulate evidence, or create recipes. Production job ownership, replay safety, and exactly-once recipe persistence remain the worker's responsibility and require integration verification before rollout.

Trace each stage's input reference, outcome, reason, duration, selected/excluded sources, merge decisions, detector/model/prompt version, and usage where available. The review recorder retains exact model inputs/responses; ordinary application logs use IDs and bounded diagnostic summaries rather than entire private captions/transcripts or signed media URLs.

## Implementation sequence

Each implementation task should use the repository's bounded build/check/fix workflow on a branch or worktree, with a stated iteration/time limit and a stop condition for unresolved contracts. Keep this plan updated as decisions settle.

1. [x] **Freeze contracts and resolve policy proposals.** Added validated input/outcome/evidence types and dependency protocols. Selected offline Lingua detection, a 0.25 ambiguity gate, a three-link limit, and earlier-stage precedence for otherwise unresolved conflicts. Fixture compatibility is covered; the input-contract document remains backward-compatible with its existing comment/audio fields.
2. [x] **Provide review tooling.** The separately scoped manual review CLI runs captured envelopes through the real orchestrator and exports source identity, evidence, stage results, outcomes, and reviewer corrections. Broader comparative evaluation is tracked separately under Extractor v2.
3. [x] **Implement source adaptation and provenance.** Reused the parser, independently verify creator authorship, normalize selected text, resolve safe links, and provide bounded HTTP and transcription adapters. Live ScrapeCreators comment acquisition remains deferred until its response contract is verified.
4. [x] **Implement HTML and text orchestration.** The cleaner is injected before every HTML extraction; the orchestrator provides language gates, complete/partial classification, source metadata, and trace events.
5. [x] **Implement eligible fallback and merge policy.** Added bounded linked-page sequencing, source identity checks, retained partial evidence, grounded exact deduplication, and call-count assertions.
6. [x] **Add audio evidence extraction.** Added a source-only Gemini transcript operation, validation of its closed response shape, transcript provenance, and conservative merge behavior. It remains injectable and does not run enrichment.
7. [x] **Connect the real ExtractorV2 and production path.** The production path uses the real extractor and orchestrator. Captured-payload regression coverage exercises the integrated path; remaining TikTok fixture review is tracked separately under Extractor v2.
8. [x] **Complete orchestrator handoff.** Documented the callable interface, provider boundaries, verification, and remaining separately tracked evaluation work. This plan is in `docs/specs/completed/`.

## Verification and acceptance criteria

Add `services/api/tests/test_extraction_orchestrator.py`, with focused contract/merge test files if needed. Use fake providers and sanitized frozen fixtures; normal tests require no network, paid models, browser profile, or database.

- Both v1 payload kinds work; malformed inputs and unknown versions fail before dependency calls. Partial capture does not imply partial recipe.
- Raw and linked HTML are cleaned before extraction; structure, group headings, order, links, and provenance survive. Broader HTML never reaches Gemini recovery.
- Matching creators are included; viewer comments, forged Boolean flags, missing identities, and conflicting author IDs are excluded, including replies.
- Complete social text makes zero linked-page/audio/model-extraction fallback calls. Missing amounts alone do not trigger fallback.
- A linked page precedes audio; complete linked evidence stops audio. Failed/partial linked stages retain usable evidence and allow eligible continuation. Duplicate links and cycles cannot cause unbounded work.
- Ingredients from a caption and steps from audio become complete with correct per-item provenance. Audio is sent to model extraction even when deterministic text extraction would find nothing.
- Explicit creator corrections and caption-over-audio precedence preserve competing facts. Different recipes never merge; grouped ingredients do not accidentally deduplicate across groups.
- Ingredients-only and instructions-only results produce the correct issue code after fallbacks; no content fails. Intermediate operational failures do not erase a saveable partial result.
- Cover en/de/pl/fr/es, unsupported languages, unknown/short text, and mixed-language evidence according to the finalized gate. No translation occurs.
- Invalid model schemas/reason codes/references, provider timeouts, rate limits, fetch failures, transcription failures, cancellation, and forbidden redirects yield the defined behavior.
- Repeated and concurrent runs do not share mutable evidence or mutate fixtures. Offline replay performs no live source fetches.
- Stage records and the review export explain exactly why sources were skipped, merged, selected, or rejected.

Run from `services/api` after implementation:

```sh
uv run pytest tests/test_extraction_orchestrator.py tests/test_html_cleaner.py tests/test_gemini_extraction.py
uv run pytest
```

Run fixture compatibility tests from the repository root:

```sh
uv run --project services/api pytest tools/instagram-fixture-capture/test_fixture_payload.py
git diff --check
```

The full suite may require its existing service/test configuration; record environment blockers and actual results rather than marking unrun checks as passing. Run the batch comparison separately because it may invoke paid models. The user supplies the review dataset and manually reviews the spreadsheet; no automatic score replaces their approval.

## Production integration and rollback gates

Keep the current extractor active throughout this work. Before enabling v2 for new imports, complete recipe evidence/issue persistence, idempotent issue dismissal, the single enrichment handoff, incomplete nutrition/allergen semantics, worker retry and duplicate-job handling, and web/mobile complete/partial/failed states. Add all user-facing strings in en, pl, de, fr, and es, including unsupported-language recovery and cooking-mode unavailability without steps.

Production routing requires the user's explicit approval after manual evaluation. Provide an explicit v2 enable/disable setting for new imports and a rollback to legacy routing; never silently rerun a failed v2 import through legacy extraction. Existing recipes remain unchanged. Commit only after the user confirms the change is complete and correct.
