# Extraction review replay

Run `uv run --project services/api python tools/extraction-review/run_review.py --manifest tools/extraction-review/manifest.json --output .local/extraction-review` from the repository root.

The runner is offline by default: it reads only manifest-relative snapshots and never acquires URLs. Each case declares a SHA-256 input hash, input kind, evidence IDs/spans, and optional frozen legacy result. It writes one JSON artifact per case and an XLSX index. Reviewer notes in the previous XLSX are copied by stable case ID when `--resume-from` is supplied. Use `--allow-paid-models` only in a separately configured adapter; this runner deliberately has no live model integration.
