# Extraction review

Run captured source envelopes through the real extraction-v2 orchestrator and inspect the resulting `review.xlsx` workbook and JSON sidecars. Instagram/social captions use Gemini line selection by default. HTML extraction remains deterministic. The runner never fetches a linked URL, transcribes media, or starts the API server. Add `--text-selector off` only when you explicitly want an offline deterministic comparison.

```powershell
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads/html-cooking-nytimes-com-recipes-1015181-marcella-hazans-bolognese-sauce.json
uv run --project services/api python tools/extraction-review/run_review.py "services/api/tests/captured-payloads/*.json" --csv
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads --offset 10 --limit 5
```

Each invocation creates a timestamped directory under `.local/extraction-review/` unless `--output` is supplied. It contains `review.xlsx`, `review.json`, `review-testable.json`, `run.json`, the raw envelope and a full result JSON for each case. `review.json` is case-shaped: each case has a `summary`, a simplified ordered `components` array, plus readable `ingredients`, `steps`, `evidence`, `stages`, and `model_calls` arrays. `review-testable.json` has the exact `expectations.json` schema and a top-level `url` for single-fixture runs, so manually approved entries can be copied directly into the regression fixture. The workbook has Summary, Stages, Evidence, Recipe items, and Model calls sheets. Reviewer fields are restored by case ID and input hash with `--resume-from <previous-review.xlsx>`.

Directories are searched non-recursively. Quoted globs are expanded by the runner, duplicate inputs are skipped, and capture bookkeeping files are recorded in `run.json`. HTML envelopes supplied as input (or by `--linked-fixtures`) are the only linked-page snapshots available to social captures. A missing snapshot is reported as `LINKED_SNAPSHOT_MISSING` and is never fetched.

Use `--offset` and `--limit` to process a stable slice of the sorted, deduplicated input list. For example, `--offset 10 --limit 5` reviews inputs 11 through 15.

Saved transcripts are extracted with Gemini by default when earlier evidence is incomplete; the runner never downloads media or retranscribes. Use `--audio-model off` for an offline review; it marks an incomplete case with an available transcript as `AUDIO_MODEL_DISABLED` rather than claiming the transcript contains no recipe. Audio evidence has a 45-second review timeout and retries one transient provider failure; a final failure is recorded in the case artifacts.

Instagram/social captures automatically use Gemini (configured credentials are required):

```powershell
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads/instagram-Da2Tb9XISso.json
```

The selector receives numbered source lines and may return only line IDs plus exact
nutrition quotations. Invalid output, timeouts, and provider errors fall back to the
deterministic text extractor; the result trace records that diagnostic. HTML remains
deterministic. `--text-selector off` provides an explicit offline comparison.
No `--allow-paid-models` flag is required.

The text selector defaults to `gemini-3.1-flash-lite`, configured independently
through `GEMINI_TEXT_SELECTION_MODEL`. Set `GEMINI_API_KEY` in the environment
when running from the repository root. Requests have a 20-second total timeout
and at most two attempts, including one transient-error retry. Use `--limit` to
bound the number of reviewed inputs; `--max-model-calls` is currently rejected.
Local review artifacts include the selected model, selection request/response,
reported token usage, and fallback diagnostics. These artifacts contain source
text and should be treated as private review data.

Saved-transcript evidence uses `gemini-3.1-flash-lite` by default, configured
separately through `GEMINI_AUDIO_EVIDENCE_MODEL`.
