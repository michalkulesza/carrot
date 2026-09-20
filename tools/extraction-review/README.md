# Extraction review

Run captured source envelopes through the real extraction-v2 orchestrator and inspect the resulting `review.xlsx` workbook and JSON sidecars. The default is strictly offline: it never fetches a linked URL, transcribes media, starts the API server, or loads Gemini configuration.

```powershell
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads/html-cooking-nytimes-com-recipes-1015181-marcella-hazans-bolognese-sauce.json
uv run --project services/api python tools/extraction-review/run_review.py "services/api/tests/captured-payloads/*.json" --csv
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads --offset 10 --limit 5
```

Each invocation creates a timestamped directory under `.local/extraction-review/` unless `--output` is supplied. It contains `review.xlsx`, `review.json`, `run.json`, the raw envelope and a full result JSON for each case. `review.json` is case-shaped: each case has a `summary` plus readable `ingredients`, `steps`, `evidence`, `stages`, and `model_calls` arrays. The workbook has Summary, Stages, Evidence, Recipe items, and Model calls sheets. Reviewer fields are restored by case ID and input hash with `--resume-from <previous-review.xlsx>`.

Directories are searched non-recursively. Quoted globs are expanded by the runner, duplicate inputs are skipped, and capture bookkeeping files are recorded in `run.json`. HTML envelopes supplied as input (or by `--linked-fixtures`) are the only linked-page snapshots available to social captures. A missing snapshot is reported as `LINKED_SNAPSHOT_MISSING` and is never fetched.

Use `--offset` and `--limit` to process a stable slice of the sorted, deduplicated input list. For example, `--offset 10 --limit 5` reviews inputs 11 through 15.

Saved transcripts are retained as source material. Offline runs mark an incomplete case with an available transcript as `AUDIO_MODEL_DISABLED`; they do not claim the transcript contains no recipe. Live and replay audio-model adapters remain pending work and the CLI rejects those modes instead of accidentally making a paid call.
