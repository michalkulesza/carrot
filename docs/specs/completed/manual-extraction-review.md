# Manual orchestrator v2 review CLI

Status: complete. This plan records the implemented local review workflow; future enhancements such as replaying paid model calls or recording deeper internal orchestration snapshots are outside its scope.

## Goal

Run captured source JSON envelopes through the real extraction-v2 orchestrator and inspect their routing, evidence, recipe output, and errors in a workbook. Keep this local: do not save recipes, require an API server/database, fetch linked pages, download media, or transcribe.

## Delivered behavior

- Accept one or more envelope files, directories, and quoted globs; sort and deduplicate inputs, report skipped capture bookkeeping files, and keep malformed inputs visible without stopping valid cases.
- Run the real orchestrator and extraction components. Use captured HTML snapshots for linked-page evidence and saved transcripts for the configured audio-evidence model when applicable. Never fetch a missing page or retranscribe media.
- Support offline audio review with `--audio-model off`, and live transcript extraction with the default `--audio-model live`. Social text selection is live by default and can be disabled with `--text-selector off`.
- Produce an Excel workbook with Summary, Stages, Evidence, Recipe items, and Model calls sheets, plus JSON artifacts containing source and result details. Optional CSV export is available.
- Preserve reviewer fields when rerunning matching input hashes with `--resume-from`; support stable input slices with `--offset` and `--limit`.

## Usage

```powershell
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads/html-cooking-nytimes-com-recipes-1015181-marcella-hazans-bolognese-sauce.json
uv run --project services/api python tools/extraction-review/run_review.py "services/api/tests/captured-payloads/*.json" --csv
uv run --project services/api python tools/extraction-review/run_review.py services/api/tests/captured-payloads --offset 10 --limit 5
```

See [the runner README](../../../tools/extraction-review/README.md) for output files, model configuration, and review workflows.

## Verification recorded

On 2026-09-20, `uv run --project services/api pytest tools/extraction-review/test_review_runner.py services/api/tests/test_extraction_orchestrator.py` passed (11 tests). The NYT HTML capture produced a five-sheet workbook and source/result sidecars. A Polish social capture was correctly marked limited with audio extraction disabled, without attempting transcription or network fallback. The API regression suite also runs captured envelopes offline through the cleaner, language detector, extractor, and orchestrator.

Manual recipe-quality approval remains the reviewer's responsibility; a complete extraction outcome is not a quality score.
