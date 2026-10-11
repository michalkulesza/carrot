# Duplicate import detection

When a URL import points at a recipe the user already has, stop before the expensive extraction and let the user decide.

## Behaviour

- Detection runs in the import worker (`services/api/src/api/services/import_worker.py`, `_process_job`) right after the membership check, before `_run_pipeline`.
- Applies only when ALL hold: `job.kind == "url"`, `job.parent_recipe_id is None` (not a linked-component child), `input` has no `replaces_recipe_id`, `input` has no `allow_duplicate: true`.
- A duplicate is an existing recipe whose `source_url` equals the job URL after normalization, within the job's scope:
  - `job.household_id` set: recipes linked to that household via `recipe_households`.
  - `job.household_id` is null: recipes with `author_id == job.user_id`.
- Normalization (`normalize_source_url` helper, unit-tested): lowercase scheme/host, strip leading `www.`, drop fragment, drop trailing slash on the path, drop tracking params (`utm_*`, `fbclid`, `igshid`, `gclid`, `ref`), keep other query params sorted. Candidate lookup may pre-filter in SQL by host (`ILIKE`), then compare normalized values in Python.
- On duplicate: job -> `status=failed`, `failure_code="duplicate_recipe"`, `duplicate_recipe_id=<existing recipe id>`, `next_attempt_at=None`, emit `import_job.failed` (same as other failures, incl. `finalize_parent_of_child` is NOT needed since children are skipped).
- Push text for this failure (in `_deliver_pushes`): title "Already in your library", body "Tap to review the import."

## API contract

- `ImportFailureCode.DUPLICATE_RECIPE = "duplicate_recipe"`.
- New nullable column `import_jobs.duplicate_recipe_id` (UUID, FK `recipes.id` ON DELETE SET NULL). Add via the idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern used in `services/api/src/api/main.py` and on the SQLAlchemy model.
- `ImportJobOut` gains `duplicate_recipe_id: uuid.UUID | None = None`; `_job_out` fills it.
- New route `POST /api/imports/jobs/{job_id}/import-anyway` -> `ImportJobOut`. Requires the job to be `failed` with `failure_code == "duplicate_recipe"` (else 409 `import_job_cannot_import_anyway`). Sets `input = {**input, "allow_duplicate": True}`, clears `failure_code`/`duplicate_recipe_id`, then resets exactly like `retry_import_job`. Idempotent for repeated taps (a second call on an already re-queued job returns 409, which the client ignores).
- Existing `POST /jobs/{id}/retry` and `/dismiss` are unchanged. (Retry on a duplicate job simply re-detects.)

## Client (mobile + shared)

- `packages/shared/src/types.ts`: add `"duplicate_recipe"` to `ImportFailureCode`; `ImportJob.duplicate_recipe_id: string | null`.
- `packages/shared/src/api/client.ts`: `importJobAnyway(jobId)` calling the new route.
- `packages/shared/src/hooks/useImportJobs.ts`: expose an `importAnyway` mutation, same optimistic pattern as `retry`.
- Locales (en, pl, de, fr, es): `importJobs.failure.duplicate_recipe` = "Already in your library", `importJobs.duplicate.message` (action sheet message, e.g. "This link matches a recipe you already saved."), `importJobs.duplicate.importAnyway` = "Import anyway", `importJobs.duplicate.goToRecipe` = "Go to recipe", `importJobs.duplicate.dontImport` = "Don't import". Cancel reuses `common.cancel`.
- `apps/mobile/src/screens/RecipesScreen/PendingJobCard.tsx`: for a failed job with `failure_code === "duplicate_recipe"`:
  - the card tap opens the iOS action sheet (`ActionSheetIOS`) with: Import anyway, Go to recipe (`router.push('/recipe/<duplicate_recipe_id>')`, hidden if id is null), Don't import (destructive, = dismiss), Cancel (closes sheet only, keeps the job).
  - right side: a `chevron-right` (secondaryLabel) instead of the refresh button, since retry would just re-detect.
  - other failed cards are unchanged.
- `apps/mobile/src/screens/RecipesScreen/index.tsx`: pass `onImportAnyway` / `onGoToRecipe` through to the card.
- Web (`apps/web/.../ImportJobCards.tsx`): only needs to compile and show the new failure title via the existing `importJobs.failure.<code>` lookup. No new web UI.

## Out of scope

Text and image imports (no stable identity to compare), fuzzy title matching, and duplicate detection for linked-component child jobs.
