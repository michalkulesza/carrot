# Plan my week — meal-plan generator

Status: planned · **blocked on `docs/specs/household-v2.md`**

## Context

`docs/TODO.md` has carried **"Weekly meal-plan generator — Auto-fill a week while honoring allergens,
preferences, and variety, then generate its shopping list"** under *Portfolio / showcase* since the
roadmap was written. Nothing has been built.

The real problem is not "the plan is empty" — it's **decision fatigue over a library you've
outgrown**. Once you've imported 150 recipes you still cook the same six, because picking seven
dinners from a 150-row list is harder than picking from nothing. Every meal-plan entry today is
created one tap at a time through `RecipePickerModal` / `RecipePicker`, filtered by literal title
match only.

The outcome: you say *what kind of week you want* — "chicken twice, one fish night, pasta twice,
nothing over 30 minutes on weeknights" — and Carrot proposes a whole week **drawn only from recipes
already in your library**, shows why it picked each one, lets you lock and reroll individual days,
then turns the week into a shopping list.

Nearly all the required data already exists: categorised tags (protein/carb/cuisine/time),
`total_time_minutes`, per-serving macros, allergen flags on every ingredient, pgvector recipe
embeddings, favourites, and meal-plan history. **This feature adds no new tables.**

## Prerequisite

Designed on top of `docs/specs/household-v2.md`, which must ship first. After v2 there is no personal
scope: `meal_plan_entries.household_id` is `NOT NULL`, recipes reach a household through
`recipe_households`, and `get_active_household_id` returns a non-optional `UUID`. Every scope filter
below assumes that. Household-v2 carries a destructive, irreversible migration — the generator is
blocked behind it.

## Decisions

| Area | Decision |
|---|---|
| Meal slots | **Dinner only.** One entry per date, matching the current schema. The separate *"Multiple meals per day"* TODO item stays separate; the solver takes a list of dates, so it extends to `(date, slot)` pairs later without redesign. |
| Input | **Hybrid** — structured craving chips with counts, plus one optional free-text wish. |
| Selection | **Deterministic solver.** No LLM chooses recipes. |
| Scope of extras | Locking / reroll, variety + allergen rules, leftover pairing, shop-the-week. Pantry, budget, seasonality, streaks and shareable week cards are out. |
| Persistence | Generation writes nothing. The proposal is applied only on explicit confirmation. |

## Where AI is — and is not — involved

`solve()` is pure Python scoring: quotas, staleness, time caps, favourites, seeded jitter.
Deterministic, free, and unit-testable with no network. This is deliberate — an LLM picking seven
dinners demos well and frustrates by week three, because you cannot tell it "not that one again" and
have it stick.

AI appears in exactly two places, both reusing existing infrastructure:

| Where | What it costs | If unavailable |
|---|---|---|
| **Free-text wish** | One Gemini embedding call — the same `generate_embedding(q, "RETRIEVAL_QUERY")` that `GET /api/recipes/search` already makes (`routes/recipes.py:277`). Results become a *score boost*, never a hard filter. Empty field → **zero** LLM traffic. | Field disables; everything else works. |
| **Variety term** | **Nothing.** Reads `recipe_embeddings` vectors the import worker already generated. No new calls. | Falls back to tag-set Jaccard distance. |

Generation must never fail because the AI layer is down, mirroring how `search_recipes` swallows
provider failures today (`routes/recipes.py:300`).

---

## Product behaviour

### Entry point

A **"Plan my week"** action next to Print / Export in the meal-plan header (web `PageHeader` action;
mobile `useMealPlanHeader`). Opens on the upcoming week by default with its own week stepper — the
calendar is month-based, so the generator carries its own range.

### Step 1 — Compose

```
┌ Plan my week ──────────────────────────────┐
│  ‹  Mon 3 – Sun 9 Aug  ›      2 servings ± │
│                                             │
│  PROTEIN   Chicken ×2   Fish ×1        +   │
│  CARB      Pasta ×2                    +   │
│  CUISINE   Asian ×1                    +   │
│  DIET      Vegetarian ×2               +   │
│                                             │
│  ✎ "something warm and comforting Sunday"  │
│                                             │
│  Weeknights under  [ 30 min ▾ ]            │
│  Don't repeat what I cooked in the last     │
│  [ 4 weeks ▾ ]                              │
│  Variety   ●────────○                       │
│  ☑ Avoid our allergens                      │
│  ☑ Plan leftovers when a recipe makes extra │
│                                             │
│         [ Surprise me ]   [ Generate ]      │
└─────────────────────────────────────────────┘
```

Chips come from the seeded tag taxonomy in `services/api/src/api/main.py` `_DEFAULT_TAGS` — the
`protein` / `carb` / `cuisine` / `time` categories plus the uncategorised diet tags. Each chip is a
**quota** ("I want N nights of this"), not a filter. Quotas may be satisfied simultaneously by one
day — a Chicken + Asian + Quick recipe fills three at once. That overlap is what makes small
libraries work.

### Step 2 — Review (nothing written yet)

```
┌ Your week ─────────────────────────────────┐
│ Chicken 2/2 ✓  Fish 0/1 ⚠  Pasta 2/2 ✓     │
│ Vegetarian 2/2 ✓  Asian 1/1 ✓               │
│                                             │
│ Mon  🍝 Cacio e Pepe          🔒  ↻  ⇄     │
│      Pasta ×2 · 20 min · not cooked since   │
│      March                                  │
│ Tue  🍗 Miso Chicken Thighs   🔒  ↻  ⇄     │
│      Chicken ×2 · Asian ×1 · 25 min         │
│ Wed  🥗 Halloumi Traybake     🔒  ↻  ⇄     │
│      Vegetarian ×2 · ★ favourite            │
│ Thu  🍝 Lentil Ragù           🔒  ↻  ⇄     │
│      Pasta ×2 · Vegetarian ×2 · 30 min      │
│ Fri  🍗 Lemon Chicken         🔒  ↻  ⇄     │
│      Chicken ×2 · 30 min · never cooked     │
│ Sat  🥘 Chorizo Rice          🔒  ↻  ⇄     │
│      makes 4 → leftovers Sunday             │
│ Sun  ♻️ Leftovers: Chorizo Rice             │
│                                             │
│ ⚠ No fish night — every fish recipe was     │
│   cooked in the last 4 weeks. [Relax this]  │
│                                             │
│      [ ↻ Reroll all ]      [ Apply week ]   │
└─────────────────────────────────────────────┘
```

- **A "why" line per day** — every score term that fired becomes a chip. No black box.
- **Lock / reroll / swap per day.** Reroll re-runs generation with the other days locked, so one bad
  pick never costs the week. Swap opens the existing recipe picker for that date.
- **A coverage bar that admits failure** — `Fish 0/1 ⚠` with a plain-language reason and a one-tap
  *Relax this* that re-runs with that rule loosened. Silently dropping an unmeetable quota is the
  fastest way to make people distrust a generator.
- **Existing entries are never clobbered.** Days that already hold a meal are treated as locked
  unless explicitly cleared.

### Step 3 — Shop the week

After applying, **"Shop this week"** aggregates every planned recipe's ingredients for the range into
the shopping list, scaled to the chosen servings and merged by ingredient name.

`aggregateIngredients(entries: MealPlanEntry[])` already exists at
`packages/shared/src/utils/ingredientUtils.ts:197` and is currently **dead code** — nothing in either
app references it. This wires it up for the first time.

### Supporting behaviours

| Behaviour | Rationale | Cost |
|---|---|---|
| **Rotation memory** — "not cooked since March" boost | The biggest real-world win: surfaces the 140 recipes you forgot you saved. | A `meal_plan_entries` history query. No new table. |
| **Variety dial** via recipe embeddings | Penalises two near-identical dinners. The pgvector vectors exist for search; reuse them for *dissimilarity*. | Cosine distance in Python over a few hundred candidates. |
| **Leftover pairing** | If a recipe's `servings` ≥ 2× target and the next day is free, fill it with a plain-text "Leftovers: X" entry. | Uses the existing `MealPlanEntry.text` field. No schema change. |
| **Surprise me** | One tap, no chips: pure rotation + variety + favourites. The empty-library-paralysis path. | The no-quota branch of the same solver. |
| **Seeded regeneration** | Reroll gives a genuinely different week, but the same seed always gives the same week — bugs reproduce, tests stay deterministic. | An `int` in the request/response. |

### Use cases

- *"I bought a big pack of chicken thighs."* → `Chicken ×3`, spread out, never two nights running.
- *"Busy week."* → weeknights under 25 min, one long weekend cook, leftovers Sunday.
- *"We're in a rut."* → Surprise me, variety high, 8-week no-repeat window.
- *"My partner is vegetarian on weekdays."* → `Vegetarian ×5`.
- *"Gym block."* → `High-Protein ×5`; protein-per-serving joins the score.
- *"Guests Saturday."* → lock Saturday to a chosen recipe, generate around it.

---

## Backend

### Solver — new `services/api/src/api/services/meal_plan_generator.py`

Pure functions: no DB session, no network. That is the point — the existing test style
(`services/api/tests/test_meal_plan.py`, `test_gemini_extraction.py`) is DB-free unit tests.

```python
@dataclass(frozen=True)
class Candidate:
    recipe_id: UUID
    tag_ids: frozenset[UUID]
    tag_categories: Mapping[UUID, str | None]
    total_time_minutes: int | None
    servings: int | None
    is_favourite: bool
    allergens: frozenset[str]      # flattened from components[].ingredient_flags[]
    last_planned_on: date | None
    embedding: tuple[float, ...] | None
    wish_rank: int | None          # position in the semantic-search result, if any

def build_candidates(...) -> list[Candidate]
def score_candidate(candidate, state, rules, seed) -> tuple[float, list[ReasonCode]]
def solve(dates, candidates, quotas, rules, locked, seed) -> Proposal
```

1. **Hard filters** — active allergens (unless overridden), per-weekday time cap, explicit excludes.
   Mon–Fri counts as weeknight and Sat/Sun as weekend regardless of `week_start_day`, which only
   affects calendar rendering.
2. **Greedy fill, quota-constrained days first.** Each score term emits a `ReasonCode`:
   - **quota fit** (dominant) — how many unmet quotas this recipe consumes
   - **staleness** — days since `last_planned_on`, saturating; never-planned recipes take the max
   - **variety penalty** — max cosine similarity against recipes already chosen this week
   - **time fit** for that weekday
   - **favourite** bonus
   - **wish** bonus derived from `wish_rank`
   - **seeded jitter** so reroll differs but stays reproducible
3. **Repair pass** — if quotas remain unmet, swap the lowest-marginal-value unlocked day for the best
   quota-satisfying candidate.
4. **Leftover pass** — for each chosen recipe with `servings ≥ 2 × target_servings`, if day+1 is in
   range, open and unlocked, emit a text entry. Cap at 2 per week.
5. Return `Proposal { days, coverage, unfilled, seed }`. **Writes nothing.**

Degradation is mandatory: when `semantic_search_enabled` is false, embeddings are missing, or Gemini
is down, the variety term falls back to tag-set Jaccard distance and the wish is ignored.

### Routes — extend `services/api/src/api/routes/meal_plan.py`

Both new paths must be declared **before `/{date_str}`**, as noted at `meal_plan.py:136`.

- **`POST /api/meal-plan/generate`** → `MealPlanProposalOut`. Read-only. Body: `start_date`,
  `end_date` (≤ 14 days), `servings`, `quotas: [{tag_id, count}]`, `rules`, `wish`,
  `locked: [{date, recipe_id}]`, `seed`. Loads candidates through the household-v2
  `recipe_households` filter, the household+personal allergen union, the meal-plan history window and
  `recipe_embeddings`; calls `solve`; returns. Reroll-one-day is this same endpoint with the other
  six days in `locked`.
- **`PUT /api/meal-plan/bulk`** — writes the accepted proposal in one transaction and emits a
  **single** `meal_plan_changed` broadcast for the range instead of seven. Reuses `_entry_filter` and
  `get_scope_key("meal-plan", ...)`.

Per `CLAUDE.md`, `POST /generate` takes an idempotency key and the Generate button debounces — the
same convention as `POST /api/imports/jobs`.

New Pydantic types in `services/api/src/api/models.py`, next to `MealPlanSetRequest`:
`MealPlanGenerateRequest`, `MealPlanGenerateRules`, `MealPlanQuota`, `MealPlanProposalDay`,
`MealPlanCoverage`, `MealPlanProposalOut`, `MealPlanBulkSetRequest`.

---

## Frontend

### `packages/shared`

- `types.ts` — mirror the new API types; reuse the existing `TagCategory`.
- `api/client.ts` — `generateMealPlan`, `setMealPlanEntriesBulk`.
- New `hooks/useMealPlanGenerator.ts` — a `useMutation` for generate (a POST; must not be cached) and
  one for bulk apply, invalidating `['mealPlan']`. **Add it to the `exports` map in
  `packages/shared/package.json`** — the per-hook subpath exports are easy to miss.
- New `utils/mealPlanShopping.ts` — turns a date range of `MealPlanEntry[]` into shopping-list lines,
  composing the existing `aggregateIngredients` (`utils/ingredientUtils.ts:197`) with the
  per-ingredient text rule currently implemented as `getShoppingListIngredient`
  (`apps/web/src/components/RecipeDetailModal/helpers.ts:154`). That function is already duplicated
  in the mobile equivalent — **lift it into shared and have both apps import it** rather than writing
  a third copy.

### Web

New folder `apps/web/src/pages/MealPlanPage/GenerateWeekModal/`, following the house
one-folder-per-surface pattern: `index.tsx` (two-step modal), `CravingChips.tsx` (reusing the popover
pattern from `RecipesPage/FilterBar` / `CategoryFilterDropdown`, with a count stepper per chip),
`RulesRow.tsx`, `ProposalReview.tsx`, `ProposalDayCard.tsx`, `CoverageBar.tsx`, `helpers.ts`.

Wire the trigger into `MealPlanPage/index.tsx`'s `PageHeader` action and add "Shop this week" to the
same group. `RecipePickerModal` is reused verbatim for per-day swap.

### Mobile

Mirror as `apps/mobile/src/screens/MealPlanScreen/GenerateWeekSheet/` — bottom sheet matching
`RecipePicker`'s drawer language and safe-area handling (see the completed *"Respect the safe area in
meal-plan search"* work). Trigger from `useMealPlanHeader.tsx`; reuse `AddToMealPlanSheet` for
per-day swap; haptics on generate / lock / apply per the established convention.

### i18n

New `mealPlanGenerator.*` block in all five locale files
(`packages/shared/src/locales/{en,pl,de,fr,es}.json`): title, step labels, every rule, every reason
code, every unfilled reason code, coverage summary, leftover prefix, apply and reroll actions.

---

## Build order

1. Solver service + its unit tests (no DB, no API surface — fully testable in isolation).
2. Pydantic types, `POST /generate`, `PUT /bulk`.
3. Shared package: types, client, hooks, `mealPlanShopping`, and lifting `getShoppingListIngredient`.
4. Web compose + review UI, then "Shop this week".
5. Mobile equivalents.
6. i18n across all five locales.

Commit at each step; per `CLAUDE.md`, confirm with the user before each commit and include this file.

---

## Verification

### Backend (`services/api/tests/test_meal_plan_generator.py`, pytest, no DB)

- quota satisfaction, including one recipe satisfying overlapping quotas
- allergen hard filter, plus the explicit-override path
- weeknight vs weekend time caps
- no-repeat window honoured; rotation boost orders never-cooked above recently-cooked
- variety falls back to tag Jaccard when embeddings are absent or `semantic_search_enabled` is false
- determinism: same seed → identical proposal; different seed → different proposal
- locked days preserved verbatim; existing entries untouched
- leftover pairing fires only when `servings ≥ 2 × target`, never on a locked or occupied day, capped at 2
- unfilled days carry a specific reason code; coverage reports the shortfall rather than hiding it
- scope isolation — compile the candidate statement to SQL and assert the `recipe_households` join,
  the way `test_meal_plan.py` asserts `_next_entry_statement`
- route registration order: `/generate` and `/bulk` resolve before `/{date_str}`

### Manual (`pnpm be:web`, then `pnpm ios`)

1. Seed a household library with ≥ 25 recipes spanning several protein/carb/cuisine/time tags.
2. Generate `Chicken ×2, Pasta ×2, Vegetarian ×2, Asian ×1` with a 30-minute weeknight cap. Coverage
   fully green; every "why" chip matches the recipe's real tags and time.
3. Ask for an unmeetable quota (`Fish ×3` against two fish recipes) — amber shortfall, plain-language
   reason, and *Relax this* fills it.
4. Lock two days, reroll all — locked days survive, the rest change.
5. Reroll one day repeatedly — no other day moves, and the same recipe doesn't come straight back.
6. Set household allergens differing from personal allergens — the union applies, and a flagged
   recipe never appears unless overridden.
7. Apply, then confirm on a second device that the whole week arrives in **one** SSE push.
8. "Shop this week" — quantities scaled to the chosen servings, duplicates merged once, and
   `tsp`/`tbsp` preserved (per the completed *"Preserve tsp and tbsp units"* work).
9. Empty `GEMINI_API_KEY` / `semantic_search_enabled=false` — generation still succeeds with
   tag-based variety, the wish field disabled, and no error state.
10. Repeat the core flow on mobile; check safe area, haptics and dark mode.

---

## Deferred

- **Breakfast / lunch / leftovers slots** — needs the `slot` column and new unique index from the
  *"Multiple meals per day"* TODO item.
- **Saved presets** ("Normal week", "Gym week", "Lazy week") — valuable on the second use, but the
  only part of this design needing a new table. Ship the generator first, add presets once the chip
  vocabulary has settled.
- **Pantry / use-it-up seeding** — blocked on the separate *"Cook from what I have / pantry"* item.
- Budget balancing, seasonality, cooking streaks, shareable week cards.
