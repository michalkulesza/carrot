# Drop self-links and strip control characters from recipe text

Status: implemented, awaiting review

Follow-up to [linked-recipe-link-kinds](linked-recipe-link-kinds.md).

## Problem

1. Recipe plugins (WP Recipe Maker) auto-link ingredient names to the site's own guide pages. On
   "How to cook rice" (prod `3fe4cc66-d915-4ad9-8c5b-c48f0822ae22`, source
   `https://www.recipetineats.com/how-to-cook-rice/`) every "white rice" line links to the page itself.
   `linked_urls` skips the own URL for spawning, but the link is still stored with kind `"recipe"`, so
   `resolve_linked_allergens` treats it as an unresolved component and the recipe (and every parent
   linking to it, e.g. "Korean Beef Bulgogi Rice Bowls") stays `allergen_status = "uncertain"` forever.
2. Extracted text can contain NUL (`\u0000`) and other control characters. Prod recipe
   `a1138c63-486f-41b5-bf9d-122fd00df2c4` ("Firecracker Crispy Beef Rice Bowl") has `"saut\u0000…"` in a
   step, which breaks Postgres JSON→text casts (`unsupported Unicode escape sequence`) on any query over
   `components`.

## 1. Self-links are dropped entirely

A link whose normalised form equals the recipe's own normalised `source_url` is removed: its
`ingredient_links` slot becomes `None` (and `linked_recipe_ids` / `ingredient_link_kinds` slots `None`).
`normalize_link` already strips the `#fragment`, so `…/how-to-cook-rice/#step-2` counts as the same page.
Query strings still matter (different `?` = different page).

- Single helper in `services/api/src/api/services/linked_recipes.py`, e.g.
  `without_self_links(components, source_url)`, applied everywhere components are written, alongside
  `with_link_kinds` (initial import save in `import_worker`, `recipe_reextraction.apply_extraction`, the
  recipe save route reconcile in `routes/recipes.py`). Order: drop self-links, then compute kinds.
- `link_kinds` / `resolve_linked_allergens` / `linked_urls` also ignore self-links defensively for legacy
  data (treat as no link), so behaviour is correct before the backfill runs.
- Frontend needs no change: a `None` link renders as a plain ingredient.

## 2. Strip control characters from recipe text

Add `sanitize_text(value: str) -> str` (e.g. in `services/api/src/api/services/recipe_components.py` or a
small `text_sanitizing.py`) that removes NUL and other C0/C1 control characters except `\n`, `\r`, `\t`,
plus lone surrogates (anything that `str.encode("utf-8")` would reject). Apply recursively to every
string in recipe fields before they are stored: title, source_title, overview, notes, creator handle,
and every string inside `components` (name, ingredients, steps, ingredient_display, substitutes, etc.).

Wire it at the write boundary so all paths are covered: import worker save, in-place replace /
`apply_extraction`, the recipe create and update routes (manual edits and pasted text), and the
showcase/seed path if it writes recipes. Prefer one `sanitize_recipe_payload`-style function called from
those few places over sprinkling calls.

## 3. Backfill / cleanup

Extend `services/api/scripts/link_component_recipes.py` with `--clean-text-and-self-links` (dry run by
default, `--apply` to write): for every recipe, apply self-link removal + kinds recompute + text
sanitising; print the per-recipe changes; enqueue an allergen recheck for recipes whose links changed.
Select recipes in Python (load rows via SQLAlchemy), not via SQL JSON→text casts, which fail on the NUL
recipe.

## Tests

- self-link with identical URL, trailing slash, `www.` and `#anchor` variants dropped; different path or
  query kept; kinds/linked ids slots aligned after dropping.
- allergen resolver: recipe whose only link is a self-link → `"analyzed"`.
- `sanitize_text`: strips `\u0000`, `\x07`, `\x9f`, lone surrogate; keeps newlines, tabs, emoji, Polish
  characters; nested component structures sanitised.
- save route and worker paths apply both.
- cleanup script dry run writes nothing; apply writes and enqueues rechecks.

## Rollout

Deploy, then in `carrot-api-1`: `uv run --no-sync python scripts/link_component_recipes.py
--clean-text-and-self-links` (review), then `--apply`. Verify "How to cook rice" and "Korean Beef Bulgogi
Rice Bowls" become `analyzed` and the Firecracker recipe no longer contains `\u0000`.

## Implementation notes

- `linked_recipes.py`: `is_self_link` (normalised, `www.`-insensitive, fragment ignored, query kept) and `without_self_links`; `link_kinds` returns `None` for self-links, so `linked_urls`, `recipe_link_urls` and `resolve_linked_allergens` (which now clears `linked_allergens` and skips `None`-kind links) treat legacy self-links as plain ingredients.
- `text_sanitizing.py`: `sanitize_text` (C0/C1 controls incl. DEL except `\n\r\t`, lone surrogates), recursive `sanitize_value`, `sanitized_fields(recipe)` (changed fields only, no mutation) and `sanitize_recipe(recipe)` (in place) over title, source_title, overview, notes, creator_handle and components.
- Wired in `import_worker._save_recipe`, `apply_extraction` (covers `_replace_recipe` and `reimport_recipes.py`), the recipes create/update/CSV-import routes and the showcase seed. Self-links are dropped before kinds in worker, `apply_extraction` and both save routes.
- `link_component_recipes.py --clean-text-and-self-links [--apply]`: rows loaded via SQLAlchemy, dry run prints changes and writes nothing; apply writes and enqueues an allergen recheck when links or kinds changed.
- Frontend untouched: web and mobile already render a `null` link as a plain ingredient.
