# Web URL state and modal routing

Status: pending

## Goal

Make durable web UI state addressable with canonical URLs so recipe details,
cook mode, recipe creation, recipe-library filters, meal-plan months, and
settings sections survive refreshes and behave correctly with browser
Back/Forward. Keep transient or sensitive state out of the URL.

The primary recipe routes are:

- `/recipe/e5b89692-02c3-4ea8-897c-c842bb2f8b31`
- `/recipe/e5b89692-02c3-4ea8-897c-c842bb2f8b31#cook`

## Agreed product behaviour

### Scope and access

- This plan covers the web app. Opening these web URLs in the native iOS app
  through Universal Links is a separate follow-up in `docs/TODO.md`.
- Do not put a household ID in the URL and do not switch household context as
  a side effect of opening a URL.
- An authenticated recipe URL is available when the signed-in user authored
  the recipe or the recipe belongs to their currently active household.
- Unknown, malformed, deleted, and unauthorized recipe IDs all produce the
  same translated generic unavailable state. The UI must not reveal which of
  those conditions occurred.
- Signed-out visitors to protected URLs go to Login with the complete internal
  path, query, and hash preserved, then return to it after authentication.
  Only validated same-origin application paths may be used as return targets.
- Public recipe sharing remains unchanged at the opaque `/r/:token` route.

### Recipe detail and cook mode

- `/recipe/:recipeId` opens `RecipeDetailModal` in view mode.
- Opening a recipe from Recipes, Meal Plan, Settings, Next Meal, a completed
  public-share import, or a related-recipe link updates the URL.
- In-app opens retain the current page as the modal background. Closing the
  modal or pressing Back returns to that page with its query/hash state intact.
- A direct load, refresh, or externally opened recipe URL uses the Recipes page
  as its background. Closing it navigates to `/` rather than leaving Carrot.
- Entering cook mode pushes `#cook`. Closing cook mode or pressing Back removes
  the hash and returns to recipe view; another Back closes the recipe. Forward
  restores each state.
- Loading `/recipe/:recipeId#cook` directly opens cook mode after the recipe is
  loaded. Unsupported hashes are removed with history replacement and fall
  back to view mode.
- Opening a related recipe pushes its recipe URL, retains the original
  background page, and exits cook mode. Back returns to the previous recipe
  before returning to the background page.
- Edit mode can initially open from an in-app Edit action, but it is transient:
  the canonical URL remains `/recipe/:recipeId`, and a refresh/external open
  starts in view mode. Serving count, checked ingredients, notes, nested
  dialogs, confirmations, and arbitrary scroll position are not URL state.
- Deleting or removing the open recipe closes the modal with history
  replacement so Forward cannot reopen a known-stale detail entry.
- Repeated Open, Close, Cook, and related-recipe actions must not enqueue
  duplicate history entries or execute multiple close/back transitions.

### Timer step deep links and compatibility

- Timer notifications use `/recipe/:recipeId?step=<componentIndex>-<stepIndex>`
  to open and highlight a specific step.
- `step` is a validated, non-negative, one-time navigation command rather than
  persisted scroll state. Consume it after the modal is ready, perform the
  existing highlight, then remove it with history replacement.
- A timer step target does not combine with `#cook`; timer links open normal
  recipe view.
- Continue accepting legacy `/?recipe=:recipeId&step=:component-:step` links.
  A compatibility adapter replaces them with the canonical recipe route. All
  producers must generate only the new format after this change.

### Add Recipe route

- `/recipe/new` opens Add Recipe in URL-import mode.
- `/recipe/new?mode=text` and `/recipe/new?mode=image` select the other import
  modes. Missing or invalid modes canonicalize to `/recipe/new`.
- The selected import mode is URL state. Source URLs, pasted text, uploads,
  draft data, validation failures, and progress remain transient.
- In-app opens retain the originating page as the background; a direct load
  uses Recipes. Closing returns to the background, while flows that already
  intentionally finish on the Recipes page keep that success destination.
- Repeated Add clicks while the route/modal is already active neither add
  duplicate history entries nor reset the current form.

### Recipe-library query state

- The Recipes page stores browsing state in canonical query parameters:
  `/?q=pasta&favorites=1&tags=<tagId>,<tagId>`.
- Trim `q`; omit it when empty. Omit `favorites` unless enabled. Deduplicate
  and sort tag IDs, ignore IDs not present in the current tag set, and omit
  `tags` when empty.
- Typing and filter toggles update the current history entry with replacement,
  avoiding one Back entry per keystroke/click. Browser navigation and external
  URLs still hydrate the controls from the query string.
- Recipe modal navigation retains the complete filtered Recipes location as
  its background and restores it on close.
- Unknown query parameters are preserved unless they are invalid parameters
  owned by this feature; URL-state helpers must not erase unrelated state.

### Meal Plan month state

- `/plan` represents the current local month. Non-current months use the
  canonical `/plan?month=YYYY-MM` form.
- Previous and Next push history entries. Today pushes `/plan`, omitting the
  default month. Back/Forward walks through the visited months.
- Parse the month from the URL as the source of truth. Invalid dates and
  non-canonical values are replaced with `/plan` rather than rendered.
- Opening and closing a recipe from Meal Plan preserves its exact month URL.
- Selected days, entry action/picker dialogs, picker searches, and pending
  mutations remain transient.

### Settings anchors

- Add stable section hashes for `/settings#profile`, `#stats`, `#households`,
  `#my-recipes`, `#allergies`, `#preferences`, `#timers`, `#data`, and
  `#account`.
- On direct load or Back/Forward, scroll the section into view after it is
  rendered and move programmatic focus to its heading for keyboard and screen
  reader orientation.
- Unsupported settings hashes are removed with history replacement. Do not
  add scroll-spy behaviour or encode settings controls and dialogs in the URL.

## Design

### 1. Central URL contract

1. Add a small typed route-state module under `apps/web/src/routing/` that is
   the sole place for building and parsing recipe, cook, Add Recipe, timer
   step, Recipes-filter, Meal Plan month, and safe return-to URLs.
2. Validate recipe IDs as UUIDs before requesting them; validate step pairs,
   import modes, query booleans, tag IDs, settings hashes, and `YYYY-MM`
   strictly. Canonicalization uses `replace`, never `push`.
3. Preserve unrelated search parameters when changing state owned by a page.
   Builders must use `URLSearchParams`, not interpolated unescaped values.
4. Define a typed navigation state containing the background `Location`, a
   per-document session marker, and the transient initial recipe mode. Accept
   background/edit state only when the marker matches the current document.
   This guarantees an actual reload ignores persisted `history.state`, opens
   recipe view mode, and falls back to the Recipes background as agreed.
5. Provide one guarded navigation API/context for pages and shared components:
   open recipe view/edit, open related recipe, open/close cook mode, close the
   overlay, and open Add Recipe. Centralizing these calls prevents producers
   from drifting to different URL formats.

### 2. Authenticated recipe lookup

1. Add `GET /api/recipes/{recipe_id}` before the existing dynamic recipe
   mutation routes. Accept the path value as a string and parse the UUID inside
   the handler so a malformed UUID can return the same generic 404 as every
   other unavailable case instead of FastAPI's distinguishable 422 response.
2. Authorize the read when `Recipe.author_id` is the current user or the
   recipe is linked to a valid currently active household membership. Do not
   search or switch to another household.
3. Return the existing `RecipeOut`, including favourite and household-link
   data needed by `RecipeDetailModal`. Return the same generic 404 for a bad,
   missing, deleted, or unauthorized ID.
4. Add a typed shared API-client method and React Query detail hook. Scope the
   query key by recipe ID and active household ID so a household switch cannot
   reuse a result authorized in the previous context. Invalidate/update the
   detail cache alongside the existing recipe-list caches after mutations.
5. Expose loading, retryable request failure, and resolved-unavailable as three
   distinct route states. A network failure must never be mislabeled as an
   unavailable recipe.

### 3. Background routes and overlays

1. Refactor `AppShell` to render normal content routes against the accepted
   background location and recipe/Add overlays against the real location.
   Add `/recipe/:recipeId` and `/recipe/new` fallback content routes that render
   Recipes underneath when no valid in-document background exists.
2. Move ownership of the routed `RecipeDetailModal` from `RecipesPage`,
   `MealPlanPage`, and `SettingsPage/MyRecipesSection` into one route overlay.
   Replace local selected-recipe modal state with the central navigation API.
3. Keep recipe data mutation callbacks in `AppShell` so all entry points update
   the recipe list, authored-recipe list, stats, and detail caches consistently.
4. Lift cook-mode open/close control out of `RecipeDetailModal`; derive it from
   the route hash and route all cook controls through the navigation API.
5. Keep edit mode controlled by same-document transient navigation state. An
   external/direct route and a reload ignore it and start in view mode.
6. When related recipes are opened, carry forward the original background
   state and push the new recipe path without `#cook` or a consumed `step`.
7. Add an unavailable overlay using neutral translated copy and a safe close
   destination. Add a retryable error overlay/action for request failures.
8. Guard modal close and route transitions with current-location comparisons
   and a short-lived ref so rapid repeated callbacks remain idempotent.

### 4. Migrate every recipe URL producer

Update these existing flows to use the central route API:

- Recipes cards, table rows, search results, and Edit actions.
- Meal Plan recipe details.
- Settings My Recipes.
- `NextMealCard`.
- Related recipes in `RecipeDetailModal`.
- Authenticated public-share “Add to library” completion.
- `ExpiredTimersModal`, timer notification history, service-worker notification
  payloads, and the service-worker message navigation handler.

Add the legacy query adapter before Recipes-filter hydration so old `recipe`
and `step` parameters cannot be mistaken for or erase the new filter state.

### 5. Route Add Recipe

1. Replace `AppShell`'s `modalOpen` and `modalImportMode` ownership with the Add
   Recipe overlay route and parsed `mode` parameter.
2. Route the FAB, bottom navigation, empty state, and manual-import continuation
   through the same guarded open action.
3. Ensure switching the `mode` query intentionally changes only the import
   method. Opening the already-active modal is a no-op and does not reinitialize
   form state.
4. Preserve existing save/import cache invalidation and intentional completion
   destinations while making cancel/dismiss background-aware.

### 6. Hydrate page state from URLs

1. Replace Recipes page local search/favourite/tag initialization with parsed
   URL state. Keep semantic-search debouncing downstream of the hydrated `q`.
2. Remove `useOpenRecipeFromQuery` after its legacy behavior is covered by the
   adapter and routed overlay.
3. Replace Meal Plan's current-month-only initialization with a strict URL
   parser and URL navigation handlers. Derive its query key and visible labels
   from the parsed month.
4. Add stable IDs and focusable headings to Settings sections plus a hash
   effect that waits for the target to render before scrolling/focusing.

### 7. Authentication return paths

1. Change `ProtectedRoute` to redirect signed-out users to
   `/login?next=<encoded pathname+search+hash>`.
2. Replace Login's current `/r/`-only return rule with a shared safe-relative-
   path validator covering known protected application routes. Reject absolute
   URLs, protocol-relative URLs, malformed encodings, and unknown paths by
   falling back to `/`.
3. Verify password and Google authentication both use the same validated
   destination and `replace` the Login history entry.

### 8. Translations and accessibility

1. Add route loading, load failure, Retry, recipe unavailable, and any new
   navigation copy to `en`, `pl`, `de`, `fr`, and `es`.
2. Announce async recipe loading/errors appropriately, focus the opened modal
   or unavailable heading, restore focus on close where the opener still
   exists, and keep Escape/backdrop behavior aligned with the guarded route
   close action.
3. Give Settings section targets programmatic focus without adding them to the
   normal tab order, and honor reduced-motion preferences when scrolling.

## Verification

The user chose not to introduce a web test runner as part of this work. Verify
with the existing build/lint commands, backend pytest coverage for the new read
endpoint, and the manual browser matrix below.

### Backend tests

- An author can fetch their recipe even when it is outside the active
  household.
- A member can fetch a recipe in the active household.
- Membership in a different, inactive household does not grant the scoped
  read through this endpoint.
- Unknown, malformed, deleted, and unauthorized IDs return the same generic
  unavailable response without leaking recipe metadata.
- Favourite and household-link fields match normal `RecipeOut` behavior.

### Static verification

- Run `pnpm --filter @carrot/shared typecheck`.
- Run `pnpm --filter web exec eslint src`.
- Run `pnpm --filter web build`.
- Run the focused API tests, then the full API test suite when practical.
- Confirm every new locale key exists in all five locale files.

### Manual browser acceptance matrix

1. Open recipe view/cook URLs directly while signed in; refresh each and close
   them. Confirm the Recipes background and clean close destination.
2. Open view/edit recipes from Recipes, a filtered Recipes URL, Meal Plan at a
   non-current month, Settings My Recipes, Next Meal, and related recipes.
   Exercise Back/Forward through recipe chains and cook mode.
3. Sign out, open protected recipe/cook/Add/plan/settings URLs, authenticate by
   password and Google, and confirm the entire safe destination is restored.
   Try malicious/absolute `next` values and confirm fallback to `/`.
4. Test authored, active-household, inactive-household-only, deleted, malformed,
   and unknown recipes. Simulate a failed detail request and verify Retry is
   distinct from unavailable.
5. Trigger timer navigation from the expired modal, notification history, an
   active service-worker notification, and a legacy query URL. Confirm the
   step highlights once and the URL canonicalizes.
6. Open Add Recipe from every entry point and by direct URL in each mode.
   Rapidly repeat Add/Close actions and confirm no duplicate history or form
   reset. Confirm form data never appears in the URL.
7. Load, edit, clear, copy, and revisit Recipes query URLs. Confirm malformed
   tags/booleans canonicalize, unrelated parameters survive, and typing does
   not fill browser history.
8. Walk multiple Meal Plan months quickly, use Today, refresh, and traverse
   Back/Forward. Confirm invalid months canonicalize and recipe close restores
   the exact month.
9. Load every Settings hash directly and via Back/Forward with keyboard and
   reduced motion enabled. Confirm the correct heading is visible and focused.
10. Repeat Open, Close, Cook, related-recipe, month, and filter actions rapidly
    on mobile and desktop layouts and confirm deterministic final URL/UI state.

## Non-goals

- Household IDs or automatic household switching in web URLs.
- iOS Universal Links or Android App Links.
- Changing public `/r/:token` sharing semantics.
- Persisting edit drafts, form contents, modal confirmations, request state,
  serving choices, checked ingredients, or arbitrary scroll position in URLs.
- Adding a web automated-test framework in this implementation.
