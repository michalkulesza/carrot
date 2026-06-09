# PlateKeeper — Feature TODO

Planned features not yet implemented, roughly grouped by theme.

---

## Recipe UX

### Units system
Standardise units across the app: metric / imperial toggle, unit normalisation on import
(e.g. "1 cup" → ml when metric is active). Conversion table lives in `packages/shared`.

### Changing servings / scaling
Inline serving adjuster on the recipe view and in cooking mode.
Multiplies all `qty` fields live; fractional quantities rendered as fractions or decimals.
Already partially planned in PLAN.md — wire up the UI.

### Notes in recipes
Private per-recipe notes field (freeform text, markdown-lite).
Shown below the recipe, not part of the structured data.
Optional: versioned snapshots ("v1: original import", "v2: my tweaks").

### Timer integration in steps
Detect duration patterns in step text ("bake for 30 minutes", "simmer 10 min").
Surface a tap-to-start countdown timer inline in the step card.
Multiple concurrent timers allowed (one per step). Fires a notification when done.

### ~~Always-on display~~ ✓ done
Screen Wake Lock toggle in the recipe detail modal action bar (view mode).
Amber sun button keeps the screen on while reading; auto-releases on modal close and re-acquires on tab focus. Preference persisted in `sessionStorage`.

---

## Discovery & Social

### Languages
Recipes stored in source language (already per PLAN.md).
Add a language tag on each recipe group; filter library by language.
UI stays English-only at MVP — no i18n framework yet.

### Social — profiles & public recipes
Opt-in public profile at `/u/<handle>` listing the user's public recipes.
Follow system: follow a user → their new public recipes appear in a "Following" feed.
Backed by `follows (follower_id, followee_id)` table.
Public recipes discoverable via search (separate from personal library).

---

## Health & Nutrition

### Nutritional estimates (?)
Rough macros (kcal, protein, carbs, fat) per recipe and per serving.
Source: USDA FoodData Central API or Open Food Facts (free, open).
Displayed as an optional collapsible panel on the recipe view.
Mark as estimates — not medical-grade data.
Consider: run estimation at import time via Gemini structured output rather than a lookup DB.

---

## Notes

- `(?)` = uncertain whether to build; needs spike or decision before scheduling
- Items here are **not** ordered by priority
