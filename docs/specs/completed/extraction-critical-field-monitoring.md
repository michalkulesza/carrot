# Extraction monitoring for essential recipe content

Status: complete.

## Problem and outcome

The current `report_missing_source_fields` event reports absent time, servings, and nutrition on every successful URL extraction. Those fields are often absent from the source and are not useful alerts. Monitor HTML, social, pasted-text, and image imports for missing essential recipe content and unsupported language instead, with enough safe context to identify the source and failing stage. Existing terminal import failure reporting remains in place.

## Proposed alert scope

| Source | Report when | Notes |
| --- | --- | --- |
| HTML page | Final recipe extraction has no ingredients or no cooking instructions/steps | Use the existing `MISSING_INGREDIENTS` and `MISSING_INSTRUCTIONS` classifications. |
| Social post | Final recipe extraction has no ingredients or no cooking instructions/steps | Evaluate the merged result after eligible caption, comment, linked-page, and audio fallbacks. A missing caption alone is not an alert if the final recipe has both fields. |
| Pasted text | Final recipe extraction has no ingredients or no cooking instructions/steps | Evaluate the extracted recipe, not the presence of source text. |
| Image | Final recipe extraction has no ingredients or no cooking instructions/steps | Evaluate the recipe after image transcription and extraction. |
| Any of the four sources | Final outcome is `UNSUPPORTED_LANGUAGE` | Report the terminal classification after the applicable language and fallback rules. |

Emit one dedicated missing-field event per final incomplete import job, with a stable event name and tags for input kind and issue code. Use the existing terminal import failure event for `UNSUPPORTED_LANGUAGE`; do not create a duplicate event for it. Do not emit on intermediate extraction attempts or before eligible fallbacks finish. Treat `NO_RECIPE_CONTENT` as a separate failed import, not as two missing-field alerts, because the source may contain no recipe.

## Diagnostic context and privacy

- Use only allowlisted metadata: input kind, social platform or HTML host where applicable, sanitized source origin for URL imports, final outcome, failure stage/reason, and bounded renderer/fallback status where applicable.
- Do not send recipe text, captions, comments, transcripts, HTML, raw URLs or query strings, user identifiers, model prompts, or exception messages.
- Use stable Sentry grouping by event type and reason so a high volume of imports from one site does not create a new issue per URL. Add an alert rule for the new missing-field event and verify that the existing terminal failure event identifies unsupported language.
- Keep import failure reason and stage available in job diagnostics or aggregate metrics even when they do not trigger this feature's alerts.

## Existing behavior to revise

- `services/api/src/api/services/monitoring.py` reports missing time, servings, calories, protein, fat, and carbohydrates. Replace its criteria and tests.
- `services/api/src/api/services/import_worker.py` calls the missing-field reporter only after a nonfailed URL outcome. Call the replacement reporter for incomplete HTML, social, text, and image outcomes. The existing `report_recipe_import_failure` path already reports terminal unsupported-language failures; verify its reason and source-kind context across all four sources and preserve other terminal failure reporting.
- `services/api/src/api/services/extraction_v2/contracts.py` and `orchestrator.py` already represent `MISSING_INGREDIENTS`, `MISSING_INSTRUCTIONS`, and `UNSUPPORTED_LANGUAGE`. Use these final classifications directly.

## Implementation tasks

1. Add a final-outcome missing-field decision helper for all four import sources. Ensure the existing terminal failure event identifies unsupported language and distinguishes HTML from social URL imports using the source host when the acquisition result is unavailable.
2. Call the helper once at the final successful job boundary, after eligible fallbacks and persistence. Remove the time/servings/nutrition event. Avoid duplicate events when a job is reclaimed or retried.
3. Add focused tests for each source kind with missing ingredients, missing instructions, no recipe content, complete content, and unsupported language; cover social audio fallback, retry exhaustion, repeated processing, and redacted context.
4. Configure Sentry issue grouping and the missing-field alert rule; verify one dedicated missing-field event per affected final import, the existing unsupported-language failure event, and zero events for optional source fields.

## Other failures

Keep existing terminal import failure events and their current alert behavior. The “only when” requirement replaces the old critical-field monitoring criteria; it does not change generic error reporting. For future operational visibility, counts by source and terminal reason for `SOURCE_FETCH_FAILED`, `TRANSCRIPTION_FAILED`, `MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `INVALID_MODEL_RESPONSE`, and `UNKNOWN_ERROR` could be useful in the separate operational import dashboard.
