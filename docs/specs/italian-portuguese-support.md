# Italian and Portuguese support (import + app UI)

## Problem
Recipe import accepts only en, pl, de, fr, es. Italian pages (e.g. fiordifrolla.it, now reachable via
residential egress) and Portuguese posts (the "Rosca de Laranja" reel, docs/TODO.md) fail as
`unsupported_language`. The app UI also ships only those five locales.

## Goals
1. Import Italian (`it`) and Portuguese (`pt`) recipes from HTML, social captions/transcripts, pasted text and images.
2. Full app UI in Italian and Portuguese (web, mobile, showcase), selectable in every language picker.
3. One source of truth for the supported-language list so the next language (e.g. Turkish) is a list
   entry + translations + lexicon rows.

Out of scope: Turkish (not in TODO; can follow the same recipe), App Store metadata, native iOS
`CFBundleLocalizations`, email localisation (emails are English-only today), recipe translation.

## Decisions
- Codes: `it`, `pt`. UI Portuguese is **Brazilian-leaning neutral** (e.g. "receita", "ingredientes",
  avoid strongly regional words); import lexicons cover **both** pt-BR and pt-PT forms
  (`xícara`/`chávena`, `colher de sopa`, `modo de preparo`/`modo de preparação`).
- Browser/device locales `pt-BR`, `pt-PT`, `it-IT`, `it-CH` resolve to `pt` / `it` (i18next
  `nonExplicitSupportedLngs: true` or `load: 'languageOnly'` — pick what keeps existing en/de/... behaviour).
- Plurals: `it` and `pt` use `_one` / `_other` (+ `_many` only where i18next/Intl requires it — follow
  what `pl` does for its extra forms and what the multilingual test enforces).
- Language display names stay native in pickers ("Italiano", "Português") and translated in
  `languages.*` keys of every locale.
- API validates `UserPreferencesUpdate.language` against the supported set (422 otherwise). Old
  clients only ever send supported codes, so this is safe.

## Contract (shared across agents)
- `packages/shared/src/supportedLocales.ts` (new): `export const SUPPORTED_LOCALES = ['en','pl','de','fr','es','it','pt'] as const`,
  `export type SupportedLocale`, `export const LOCALE_NATIVE_NAMES: Record<SupportedLocale,string>`.
  Exported via packages/shared/package.json `exports` like `./i18n`.
- `packages/shared/src/i18n.ts` imports `it.json`, `pt.json` and uses `SUPPORTED_LOCALES` for `supportedLngs`.
- Locale files `packages/shared/src/locales/it.json`, `pt.json`: **identical key set** to `en.json`
  (plural suffix variants per language rules), same JSON formatting as `en.json`.
- New keys `languages.it`, `languages.pt` in all 7 locale files.
- Backend `SUPPORTED_LANGUAGE_CODES` gains `it`, `pt` (still one frozenset in `extraction_v2/language.py`).

## Work packages (disjoint file ownership)

### WP1 — Backend import (Sonnet)
Owns: `services/api/src/api/services/extraction_v2/{language,lexicons,extractor,gemini_selection}.py`,
`services/api/src/api/services/{ingredient_parser_v2,unit_variants,gemini}.py`,
`services/api/src/api/routes/preferences.py`, `UserPreferencesUpdate` in `models.py`, `services/api/tests/**`.
- Allow-list + `html_lang_fallback` accept `it`, `pt`.
- Lexicons: ingredient/instruction headings (it: ingredienti, preparazione, procedimento, istruzioni;
  pt: ingredientes, modo de preparo/preparação, preparo, instruções), cooking verbs, `looks_like_ingredient`
  phrases (q.b., quanto basta, a gosto, q.b.), quantity/unit regexes.
- Extractor: yield (porzioni, persone, dosi per; porções, pessoas, rendimento, rende, serve), per-serving,
  nutrition labels (calorie, proteine, grassi, carboidrati; calorias, proteínas, gorduras, carboidratos/hidratos),
  total-time labels (tempo totale, tempo di preparazione/cottura; tempo total, tempo de preparo), time
  amounts (ore/ora, minuti; horas, minutos).
- Ingredient parser aliases: it (cucchiaio/i, cucchiaino/i, tazza/e, bicchiere, grammi/g, etto/hg, chilo/kg,
  litro/i, ml, pizzico, spicchio/i, q.b.), pt (colher(es) de sopa/chá/café, xícara(s), chávena(s), copo(s),
  grama(s), quilo(s), litro(s), pitada, dente(s) de alho, a gosto); "di"/"de" connector stripping like es/fr.
- `unit_variants._SOURCE_MEASURE`: it/pt spellings.
- Gemini prompts that enumerate languages (`gemini.py` transcription, `gemini_selection.py`) list Italian and Portuguese; "never translate" stays.
- Preference validation (422 for unknown codes) + test.
- Tests: Lingua detection it/pt; headings, yield, time, nutrition, parser units per language; prompt mentions;
  at least 2 Italian + 2 Portuguese extraction fixtures (real recipe HTML/text captured with the existing
  captured-payload tooling, reviewed expectations), including https://www.fiordifrolla.it/bolzano-apple-cake/.
- Full suite green.

### WP2 — Shared infra + web/mobile/showcase code (Sonnet)
Owns: `packages/shared/src/{supportedLocales.ts,i18n.ts}`, `packages/shared/package.json`,
the `languages` section of the 5 existing locale files (add `it`, `pt` only), `apps/web/src/i18n.ts`,
`apps/web/src/components/LanguageSwitcher.tsx`, `apps/web/src/pages/SettingsPage/helpers.ts`,
`apps/mobile/src/i18n.ts`, `apps/mobile/src/screens/SettingsScreen/helpers.ts`,
`apps/showcase/src/i18n.ts`, `apps/web/src/components/AddRecipeModal/importSources.ts`,
`apps/web/src/pages/ShoppingListPage/itemQuantity.ts`, `apps/web/tests/**`, `docs/marketing-page-content.md`.
- Replace every hard-coded five-language list with `SUPPORTED_LOCALES` / `LOCALE_NATIVE_NAMES`
  (showcase may import from `@carrot/shared` if its build allows; otherwise keep a list guarded by a test).
- Locale resolution for `pt-BR`/`it-IT` etc. on web and mobile; mobile keeps its saved-language logic.
- Import cues: step words (passo, passaggio; passo, etapa), pinch cues (pizzico; pitada).
- Shopping quantity units (cucchiai, cucchiaini, tazze; colheres, xícaras, chávenas).
- Tests: extend `multilingual.test.cjs` languages to 7 with it/pt cases for each existing block; add a
  **full key-parity test** across all 7 shared locale files and all 7 showcase locale files (allowing
  per-language plural suffix variants).
- Marketing doc: language counts/lists.
- Typecheck web/mobile/shared; web lint on touched files; `npm run test:i18n`.

### WP3 — Italian translations (Sonnet)
Owns: `packages/shared/src/locales/it.json`, `apps/showcase/src/locales/it.json` (both new).
Translate every key from `en.json` (and showcase `en.json`), natural Italian matching the tone of the
existing locales, keep interpolation `{{vars}}`, HTML/markup, and plural suffix structure; units and
defaultTags translated idiomatically.

### WP4 — Portuguese translations (Sonnet)
Owns: `packages/shared/src/locales/pt.json`, `apps/showcase/src/locales/pt.json` (both new). As WP3, pt (Brazilian-leaning neutral).

### WP5 — Shopping-list aisle keywords (Sonnet)
Owns: `apps/web/src/pages/ShoppingListPage/{aisleKeywords,aisles}.ts`.
Add `it` and `pt` sections to every aisle category (frozen, household, pantry overrides, produce
overrides, meat/seafood, dairy/eggs, produce, pantry) with common grocery terms, and any it/pt
collision rules in `AISLE_STAGES`. Coordinate with WP2 only through the test file WP2 owns: report the
cases to add; WP2 (or a follow-up) adds them.

## Sequencing
WP1, WP2, WP3, WP4, WP5 run in parallel (no shared files). After all report: orchestrator reviews,
runs the full checks (api pytest, web `test:i18n` incl. parity, typechecks, renderer untouched), then a
follow-up agent adds WP5's test cases to `multilingual.test.cjs`.

## Verification
- API suite green; Italian fiordifrolla page and a Portuguese caption import end-to-end on prod.
- Web/mobile/showcase typecheck; i18n tests incl. key parity green; switching to Italiano/Português in
  web settings, auth language switcher and mobile settings works and persists.
- `docs/TODO.md` Portuguese entry → `docs/TODO-COMPLETED.md`.
