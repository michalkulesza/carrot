# Social extraction and re-import gaps

## Problem
Previewing a re-import of "Rosca de Laranja" (recipe `cf015036-d7e3-4493-8744-96cf947d2e8e`,
https://www.instagram.com/reel/Dco3L-UvNd9/, Portuguese) on 2026-10-12 showed four regressions
versus the stored recipe:

| # | Gap | Stored | Re-import |
|---|---|---|---|
| 1 | Caption has ingredients but no steps → audio transcript not used for steps | 16 + 6 steps (from transcript) | 0 steps, `MISSING_INSTRUCTIONS` |
| 2 | Portuguese "copo" (and other measures) mapped to English "cup" | "1 copo americano de açúcar" | "1 cup açúcar" |
| 3 | Caption headings used raw as component names | "Massa", "Calda" | "🍊ingredientes ", "🍊 calda " |
| 4 | `scripts/reimport_recipes.py` replaces the archived R2 thumbnail with an expiring CDN URL | R2 `thumbnails/...jpg` | `scontent-...cdninstagram.com/...?oe=` |

Plus the open TODO "Ingredient parser unit gaps (es/fr/it/pt)": `mg`, `dl`, "c. à café", "xícara (chá)".

## Goals / acceptance
1. Social payloads whose verified caption/comments yield ingredients but no instructions use the audio
   transcript (existing audio path) to supply the instructions; the result is `complete` when the
   transcript has steps. Caption ingredients stay authoritative when both sources have them (no
   duplicated components); evidence/trace record the audio source. Same for missing ingredients with
   caption steps.
2. Measures that are not a standard cup are not converted to `cup`: "copo"/"copo americano" (pt glass,
   ~190–250 ml) and "bicchiere" (it) keep their native unit text (partial/native unit like `etto`), never
   canonical `cup`. "xícara (chá)" / "xícara de chá" → cup with the "(chá)"/"de chá" qualifier consumed
   (not left in the name); "xícara (café)" → native/partial. `mg` and `dl` recognised; French "c. à café",
   "c. à soupe", "c.à.c", "c.à.s" → tsp/tbsp with the connector stripped.
3. Component names derived from headings are cleaned: strip emoji/pictographs, decorative symbols,
   surrounding punctuation and whitespace; a heading that is only a generic ingredients/instructions word
   in any supported language ("ingredientes", "Zutaten", "ingredients:") yields no component name
   (like an unnamed main component), while specific ones ("calda", "massa", "frosting") are kept and
   capitalised consistently with existing behaviour.
4. `reimport_recipes.py --apply` never replaces an archived thumbnail with a remote URL: keep the
   existing R2 thumbnail when present; otherwise archive the new one with the same helper the import
   worker uses (`_archive_thumbnail`, residential-aware), falling back to keeping the old value.
   Also: the script's dry run gains a `--preview` mode that runs extraction and prints a before/after
   summary inside a rolled-back session (no DB/R2 writes), so re-imports can be reviewed first.

Out of scope: tag re-application in the re-import script (it ignores suggested tags today — keep).

## Work packages (disjoint files; each adds its own new test file)

### WPA — Audio fills missing instructions (Sonnet)
Owns: `services/api/src/api/services/extraction_v2/orchestrator.py`, new `services/api/tests/test_social_audio_fill.py`.
Read `_extract_social_payload` end to end (text → linked pages → audio) and fix the case where caption
text yields ingredients only. Merge rule per Goal 1. Replay the captured payload for this reel if one
exists under `services/api/tests/captured-payloads/` (or construct one from the existing social fixtures).

### WPB — Units (Sonnet)
Owns: `services/api/src/api/services/ingredient_parser_v2.py`, `services/api/src/api/services/unit_variants.py`,
new `services/api/tests/test_parser_unit_gaps.py`. Goal 2. Check UI unit display keys (`units.*` in
`packages/shared/src/locales/*.json`) only to confirm native/partial units render as their source text —
do not edit locales; report if a key is needed.

### WPC — Heading cleanup (Sonnet)
Owns: `services/api/src/api/services/extraction_v2/{extractor,lexicons,sources}.py` (only where component
names are derived), new `services/api/tests/test_component_heading_cleanup.py`. Goal 3. Must not change
names in existing fixtures/expectations unless they contain emoji/junk — list any changed expectation.

### WPD — Re-import script (Sonnet)
Owns: `services/api/scripts/reimport_recipes.py`, a small shared helper extraction from
`services/api/src/api/services/import_worker.py` only if needed to reuse `_archive_thumbnail`, new
`services/api/tests/test_reimport_script.py`. Goal 4 incl. `--preview`.

## Verification
- Full api suite green after all four.
- Orchestrator runs `--preview` for recipe `cf015036-…` on prod: expect steps present (from audio),
  components "Massa"/"Calda" (or cleaned equivalents), "copo" kept, thumbnail unchanged. If better than
  stored, apply with `--apply --recipe-id cf015036-…`, then move "Portuguese recipe support" to
  TODO-COMPLETED.md and the parser-gaps TODO item too.

## Outcome (2026-10-12)
All four gaps shipped (023f39c, c3f7a6a). The root cause of the missing steps was the audio-evidence
Gemini call timing out at 20s, plus ASCII-escaped transcripts (`ensure_ascii`); the timeout and retries
are now scaled, and transcripts are sent with `ensure_ascii=False`. Audio steps are now assigned to the
retained components.

The Rosca de Laranja re-import was previewed twice and NOT applied. Caption ingredients are
authoritative, and the caption omits salt and has a typo, so the stored recipe stays.
