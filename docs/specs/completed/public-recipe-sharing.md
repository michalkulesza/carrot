# Public recipe sharing

Status: pending

## Goal

Let a signed-in Carrot user create a time-limited public URL for a recipe from
both the web app and iOS. Anyone with that URL can view a simplified,
read-only recipe page without an account. The page introduces Carrot and
invites signed-out visitors to register or log in, without exposing private
recipe or household information. Signed-in visitors can add an independent
copy to their personal library.

## Agreed product behaviour

- A public link is created from the recipe-detail Share control on web and
  iOS. Creation is available for personal recipes and for recipes in the
  active household; the normal write-scope check means any member who can edit
  that household recipe can create the link.
- A link is an unguessable, opaque token and is valid for exactly seven days
  from its first creation. Opening Share again before expiry returns the same
  URL and does not extend the expiry. Once expired, the next Share creates a
  new token and a new seven-day window.
- There is no early revoke/unpublish action in v1. Deleting a recipe makes its
  URL unavailable even if its token has not expired.
- Public content is live, not a snapshot: permitted edits to the recipe appear
  immediately at the existing URL.
- A signed-in visitor stays on the public URL and sees the same read-only
  public recipe content inside the normal authenticated app shell. They can
  use “Add to library” to create one independent personal copy; repeated taps
  or visits through the same public share reuse that copy rather than creating
  duplicates. On success, Carrot switches to personal scope and opens the
  copied recipe in the Recipes page with success feedback.
- The saved copy contains the original recipe content, including its full
  nutrition values, components, thumbnail, and source URL. It carries only
  matching predefined tags; personal and household custom tags are not copied.
  Later edits to the original recipe or the saved copy do not affect the other.
- The public viewer includes the thumbnail, title, total time, servings with
  an adjustable multiplier, ingredients, preparation steps, public tags and
  allergen badges, kcal, and the source URL. It does not expose notes,
  creator/contributor details, user or household identity, favourites,
  shopping-list/meal-plan actions, or editing.
- Protein, fat, and carbohydrate values are displayed as blurred placeholder
  values. A non-clickable tooltip explains that full nutrition information is
  a Carrot Premium feature. Kcal and cooking time remain visible.
- The public page has a dedicated unauthenticated shell: a slim desktop
  sidebar and compact mobile top bar with the Carrot logo, temporary About
  Carrot link, Log in, and Create your free account. It must not mount the
  authenticated app shell or navigation. The temporary marketing route is
  `/marketing`; `/` remains the signed-in recipe library.
- All user-facing copy is translated in `en`, `pl`, `de`, `fr`, and `es`.

## Design

### Storage, expiry, and privacy

1. Add a `recipe_public_shares` table/model with a UUID primary key, a unique
   recipe ID (foreign key with cascade deletion), a unique high-entropy opaque
   token, `created_at`, and `expires_at`. One row per recipe is sufficient:
   after expiry its token and timestamps are replaced for the next seven-day
   window. Index the token lookup.
2. Extend the API startup schema initialization using the project’s existing
   idempotent `CREATE TABLE/INDEX IF NOT EXISTS` convention. Do not add a
   migration system just for this feature.
3. Add `public_web_url` to API settings, defaulting to the local web origin in
   development and set to `https://app.carrot.xcxz.xyz` in production. The API,
   rather than either client, builds the canonical `/r/{token}` URL so iOS and
   web never hard-code deployment domains.
4. Generate tokens with a cryptographically secure URL-safe random generator;
   enforce their uniqueness at the database layer and retry on the extremely
   unlikely collision. Never use recipe IDs, UUIDs, slugs, or user data as the
   public URL identifier.
5. Treat expiry, absent/deleted recipes, and invalid tokens identically at the
   public API boundary (404 with a generic unavailable response). Do not reveal
   whether a recipe used to exist or why it is unavailable. Public read paths
   never require authentication and must not load viewer-specific fields.
6. Make share creation repeat-safe: under concurrent/repeated taps, return the
   existing unexpired share for that recipe. On expiry, atomically rotate the
   token and expiry on its one share row. Use the database uniqueness constraint
   plus transaction/row locking or conflict handling so concurrent taps cannot
   create competing links.
7. Add a `recipe_public_share_library_additions` table/model to record the
   recipient user, source public-share row, and created personal recipe. Enforce
   a unique `(public_share_id, user_id)` pair and foreign keys with appropriate
   cascade handling. This is the idempotency record for “Add to library,” not a
   relationship that shares future edits with the source recipe.

### API contract

1. Add an authenticated `POST /api/recipes/{recipe_id}/public-share` endpoint
   in the recipes router. It uses the same active-household write filter as
   update/delete, creates or reuses the active share as above, and returns a
   typed `{ url, expires_at }` response. Put it behind the normal current-user
   dependency; no additional ownership rule is needed beyond existing recipe
   write access.
2. Add an unauthenticated `GET /api/public/recipes/{token}` endpoint in a
   separate public router (or clearly separated public section), registered
   under `/api`. It looks up an unexpired share and its current recipe, returns
   only a dedicated `PublicRecipeOut` schema, and contains no auth dependency.
3. `PublicRecipeOut` contains only the agreed viewer fields: title, thumbnail,
   servings, total time, kcal, source URL, components/ingredients/steps, tags,
   and allergen flags derived from the public recipe data. Exclude notes,
   creator handle, contributor, household ID, recipe ID, timestamps,
   favourites, personal-link state, and the real protein/fat/carbohydrate
   values.
4. Add typed shared API-client methods and types for creating a public share
   and fetching a public recipe. The public fetch must use a small unauthenticated
   request helper rather than the authenticated app data hooks; preserve the
   client’s standard network-error reporting without triggering login redirects
   for a 404 public link.
5. Add an authenticated `POST /api/public/recipes/{token}/add-to-library`
   endpoint. It validates the token and expiry exactly as the public read
   endpoint, locks/creates the recipient’s idempotency record, and creates a
   new personal `Recipe` owned by the requesting user. Copy the source’s full
   recipe fields (including real macros), image URL, source URL, ingredients,
   and steps; do not copy notes, author/household identity, favourites,
   personal links, or owner-specific state. Map only predefined tags onto the
   new recipe. Return the newly created-or-reused personal `RecipeOut`.

### Web sharing and public viewer

1. Add a Share control to the view-mode top-right toolbar in
   `RecipeDetailModal/RecipeHeroSection`. It opens a focused dialog explaining
   that anyone with the link can view the recipe for seven days.
2. The dialog’s primary action creates/reuses the public URL once, disables
   duplicate presses while pending, copies the URL, and invokes the Web Share
   API when available. Show the URL and a Copy fallback when native sharing is
   unavailable. Display the expiry after a successful response and handle
   creation/copy failures without claiming the link was shared.
3. Add `/r/:token` before the protected catch-all route in `App.tsx`. Its page
   loads the public endpoint without requiring authentication. When auth state
   is signed out, render loading, generic unavailable, and success states in
   the dedicated public shell. When signed in, render the same public viewer
   inside the existing `AppShell`/authenticated sidebar and mobile navigation,
   without leaking source-owner controls or loading the source recipe into the
   visitor’s library.
4. Build a public layout for signed-out desktop sidebar/mobile top bar and a
   read-only, responsive recipe viewer. Reuse presentational recipe pieces
   where they do not carry authenticated behaviour; keep serving scaling local
   to this page and scale displayed ingredient quantities only. Do not persist
   a serving preference or expose cook mode, timers, edit, delete, favourite,
   household, or planning controls.
5. For signed-in viewers, add a prominent “Add to library” control. Disable it
   while its request is in flight; on success, invalidate/refresh personal
   recipe data, set the active scope to personal, navigate to the Recipes page
   with the returned recipe selected/open, and show success feedback. If the
   add endpoint returns the existing copy, follow the same navigation path.
6. Render source as a safe external link (`https?` only, new tab with
   `rel="noreferrer"`), and render user-authored recipe content as text rather
   than HTML. For blurred premium nutrition cards, use non-sensitive placeholder
   values underneath the blur and an accessible tooltip with the agreed
   informational message.
7. Add a small public `/marketing` placeholder page using the same branding.
   The signed-out public-shell logo/About link targets it; Log in and account
   creation target `/login` and `/register` respectively.

### iOS sharing

1. Extend the existing recipe-detail Share (`MenuView`) actions in
   `useRecipeDetailHeader.tsx` with a top-level “Share publicly” action while
   preserving the current personal/household transfer actions.
2. Handle that menu action in the detail screen by calling the same typed API
   method with a single in-flight guard. On success, invoke the native iOS
   share sheet for the returned canonical URL and provide haptic/success or
   error feedback consistent with nearby actions. Do not add a separate
   URL-building configuration to the app.
3. Keep link creation available only in view mode and ensure repeat selections
   while a request/share sheet is active cannot generate competing requests.

### Translation and accessibility

1. Add all labels, dialog copy, expiry text, copy/share success and error
   states, public-page headings, unavailable state, signed-out and add-to-
   library CTA labels, add success/error feedback, and the premium-nutrition
   tooltip to every shared locale file.
2. Give toolbar controls, dialog controls, tooltip triggers, public navigation,
   and blurred nutrition cards clear accessible names. Keep visible focus,
   keyboard dialog behaviour, and sufficient contrast when the image or blur
   is present.

## Verification

### Backend tests

- Test personal and active-household members can create shares, while users
  outside the recipe’s accessible write scope cannot.
- Test token entropy/uniqueness handling, seven-day expiry calculation, reuse
  of an active URL, fresh token after expiry, and concurrent duplicate creation
  returning one active share.
- Test unauthenticated public retrieval returns only `PublicRecipeOut`, reflects
  current recipe edits, includes source/kcal/time, and never serializes notes,
  attribution, IDs, real premium macros, household data, or viewer state.
- Test invalid, expired, deleted, and inaccessible shares all return the same
  generic unavailable response, and cascade deletion removes the share record.
- Test add-to-library authentication, expired/invalid-link rejection,
  transactional duplicate protection, independent source/copy edits, complete
  recipe-field transfer, and predefined-tag-only mapping. Confirm the response
  is a normal personal `RecipeOut` for the recipient and no source ownership or
  household state is copied.

### Web and iOS tests

- Test the web toolbar dialog’s loading guard, active-link reuse, copy fallback,
  Web Share invocation, expiry display, and error state.
- Test `/r/:token` bypasses auth and the authenticated shell, renders public
  recipe content, serving scaling, signed-out CTA links, source safety,
  blurred premium placeholders/tooltip, and the generic unavailable page. Test
  that authenticated visitors instead receive the normal app shell and cannot
  access source-owner controls.
- Test the authenticated Add to library control’s pending guard, success/error
  feedback, cache refresh, switch to personal scope, and navigation to the
  returned recipe; test that a repeat add returns/navigates to the same copy.
- Test the iOS Share menu keeps existing household actions, adds public sharing,
  blocks duplicate requests, and passes the API-returned URL to the native
  share sheet.
- Verify every new locale key is present in all five languages.

### Manual acceptance checks

1. From both web and iOS, create a link for a personal recipe and a household
   recipe; confirm both clients return/share the same canonical `/r/{token}`
   URL and reopening Share within seven days preserves the expiry.
2. Open the link in an incognito desktop browser and mobile browser. Confirm no
   login is requested; all and only agreed fields display, source opens safely,
   nutrition premium fields are obscured, and the public CTAs work.
3. Edit a recipe while its link is live and refresh the public page to confirm
   it shows the new content. Delete the recipe and confirm the URL becomes the
   generic unavailable page.
4. Exercise expired/invalid links and rapid repeated taps/clicks on both
   platforms. Confirm no duplicate active link is created and no internal
   recipe/account information leaks.
5. While signed in as a different user, open the same public URL, verify the
   authenticated sidebar/mobile navigation appears, add it to the library, and
   confirm Carrot switches to the personal Recipes page with the independent
   copy open. Repeat the action and verify no second personal copy is created.
