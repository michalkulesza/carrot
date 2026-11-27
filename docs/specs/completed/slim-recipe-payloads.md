# Slim recipe payloads

## Problem
Every recipe the API returns (list `GET /api/recipes`, detail, related recipes, meal-plan entries,
SSE patches) carries extraction evidence and full provenance detail that no client renders.
Measured on `showcase_fixture.json`: 27–58 KB per recipe, `title_evidence` alone 6–34 KB,
provenance 6–23 KB. 100 recipes ≈ 5 MB of uncompressed JSON that mobile parses on the JS thread,
structurally shares, persists to AsyncStorage and rehydrates. Responses are not compressed
(Caddy has no `encode`, FastAPI has no GZip middleware).

## What clients actually read
- `title_evidence`: only web `PublicRecipeDetailContent.tsx` (sets it to `[]`). Unused otherwise.
- Component `ingredient_evidence` / `step_evidence` / `name_evidence`: unused by any client
  (apps/web, apps/mobile, packages/shared, tools, showcase).
- `nutrition_provenance`: only `<field>.status` for kcal/protein/fat/carbs (web `RecipeMetaBar.tsx`,
  mobile `NutritionStrip.tsx`).
- `total_time_provenance`: only `.status`.
- Metric/imperial variants ARE used (unit toggle, ingredient substitution) — keep them.

Evidence stays available from the existing `GET /api/recipes/{id}/source`.

## Changes

### Backend (`services/api`)
1. Response serialisation for `RecipeOut` (and every model that embeds it: related recipes,
   meal-plan entries, SSE payloads, public recipe if it shares the path):
   - drop `title_evidence` from responses (or always `[]` if removing breaks the public schema);
   - strip `ingredient_evidence`, `step_evidence`, `name_evidence` from each component;
   - reduce `nutrition_provenance` to `{field: {"status": ...}}` for the fields present and
     `total_time_provenance` to `{"status": ...}`.
   Do it in one place (a slim serializer / validator on `RecipeOut`), not per route.
   Keep field names and shapes otherwise identical so shipped mobile clients keep working.
2. Saving must keep stored evidence when the client omits it. `routes/recipes.py` (~694–709)
   already preserves component evidence for unchanged ingredients/steps/name — verify this covers
   a save built from slim data (empty evidence lists) and that title/provenance are never
   overwritten from a client payload. Add tests for "edit from slim payload keeps evidence".
3. List/related/meal-plan queries: `defer()` the `title_evidence` column (and provenance columns
   if only statuses are needed and can be read cheaply) so they aren't loaded at all.
4. Add `GZipMiddleware` (minimum_size ~1000) in `main.py`. It must not compress or buffer the
   SSE endpoints (`text/event-stream`): verify the installed Starlette excludes event streams,
   otherwise exclude those routes explicitly. Add a test that an SSE route isn't gzip-encoded.
5. `/source` keeps returning full evidence; extraction-review tooling must be unaffected.
6. Tests: payload no longer contains evidence keys; provenance statuses preserved; size of a
   fixture recipe response drops substantially (assert below a threshold); edit round-trip keeps
   evidence in DB.

### Shared (`packages/shared/src/types.ts`)
Make the evidence fields optional (or remove them from `RecipeOut`/component response types) and
type provenance as status-only for responses. Keep request/save types unchanged. Fix any
type fallout in web/mobile (e.g. web `PublicRecipeDetailContent` `title_evidence: []`).

### Clients
No behaviour change expected. Mobile's persisted query cache will contain old fat entries until the
next refetch — that's fine (types are a superset).

## Compatibility
- Shipped mobile builds: only read provenance statuses → unaffected; their edits send empty
  evidence, which the backend preserves (item 2).
- Web: reads provenance statuses only → unaffected.

## Verification
API tests (`uv run pytest`), shared/mobile/web typechecks. Report before/after byte size of the
list response for the showcase fixture recipes.

## Out of scope
Deferring screen content until after the push transition (step C), per-unit-system payloads.
