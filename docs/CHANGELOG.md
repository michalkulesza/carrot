# Changelog

All notable changes to **Carrot** are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## Legend

| Tag | Meaning |
|-----|---------|
| ✨ **Feature** | New capability or user-facing enhancement |
| 🐛 **Bug** | Fix for incorrect or broken behavior |

---

## [1.2.0] — 2026-07-22

### Recipes & importing

- ✨ **Feature** — Added semantic recipe search on web and mobile, so searches can find recipes by meaning as well as by matching title or ingredient text.
- ✨ **Feature** — Recipes can now be shared publicly with a time-limited link. Signed-in recipients can add a shared recipe to their personal library or a selected household.
- ✨ **Feature** — Recipe serving selections now persist per user, so a chosen serving count is retained when reopening a recipe.
- ✨ **Feature** — Allergen warnings are now retained and displayed while viewing and cooking recipes on mobile.
- ✨ **Feature** — Social and video recipe imports now use Gemini audio transcription, improving import support without relying on the previous transcript provider.
- 🐛 **Bug** — Improved resilience and recovery for failed recipe imports, including mobile URL imports.
- 🐛 **Bug** — Improved semantic-search feedback and result presentation.
- 🐛 **Bug** — Recipe thumbnails now have reliable fallback images when no thumbnail can be displayed.
- 🐛 **Bug** — Ingredient-count conversions, related-recipe navigation and editor updates, and imported-recipe placeholder transitions are more reliable.

### Recipes & cooking

- ✨ **Feature** — Mobile recipe and timer navigation now provides quicker routes to recipe details and the relevant cooking step.
- ✨ **Feature** — Added haptic feedback to more meaningful mobile interactions, including recipe-list actions.
- 🐛 **Bug** — Refined Cook mode typography, ingredient checkboxes, theme treatment, screen-wake handling, and the ingredients sheet.

### Apps & platform

- 🐛 **Bug** — Fixed dark-mode transitions while switching households and improved mobile notification history behavior.
- 🐛 **Bug** — Clarified personal-library ownership labels and household indicators throughout the apps.
- 🐛 **Bug** — Improved the web sidebar layout.

## [1.1.0] — 2026-07-17

### Recipes & cooking

- ✨ **Feature** — Restored custom tags across web and mobile, with personal and household-shared scopes plus import support.
- ✨ **Feature** — Added guided Cook mode on web and mobile: work through recipe steps one at a time with swipe/keyboard navigation, adjustable text size, ingredient checklists, inline timers, saved progress, and a screen wake lock while cooking.
- ✨ **Feature** — Recipes can now be linked as related recipes and opened directly from compact, title-aware chips on the recipe detail view.
- ✨ **Feature** — Mobile ingredient editing now uses a wheel picker for quantities and units, including mixed fractions such as 1 1/2.
- ✨ **Feature** — Ingredient quantities now use more compact unit labels throughout recipe details and steps.
- 🐛 **Bug** — Removing related recipes quickly no longer causes a server error or loses a concurrent update.
- 🐛 **Bug** — Completed text imports now transition smoothly from their placeholder card to the recipe.

### Apps & platform

- 🐛 **Bug** — Fixed recipe tag chips being invisible in dark mode.
- 🐛 **Bug** — Fixed the mobile Add tag button so its picker opens reliably on first tap.
- 🐛 **Bug** — Refined the mobile Recipes filter chips for reliable contrast and a flatter native appearance.
- 🐛 **Bug** — Renamed the recipe detail stat label from “Total time” to “Time”.

## [1.0.6] — 2026-07-16

### Apps & platform

- ✨ **Feature** — Mobile launch screen now uses a full-bleed Carrot splash followed by a 300 ms branded animation before the app appears.
- 🐛 **Bug** — Fixed a dark-mode flash at mobile startup by applying the saved appearance preference before revealing the app and its navigation chrome.

## [1.0.5] — 2026-07-15

### Recipes & importing

- ✨ **Feature** — Metric ingredient quantities now show the equivalent imperial cup amount alongside them (e.g. "300ml chicken broth (1 cup)"), scaled to the current serving count.
- ✨ **Feature** — Recipe live sync: household members now see each other's meal plan and recipe edits update in real time via SSE, without switching tabs.
- ✨ **Feature** — Broadened recipe import support: sites embedding recipes as schema.org microdata (instead of JSON-LD), Yoast-style `@graph`-nested JSON-LD (RecipeTin Eats, Jamie Oliver, and others), and WP Recipe Maker's grouped `HowToSection` steps are now parsed correctly. Added dedicated parsers for kwestiasmaku.com and oliveandmango.com.
- ✨ **Feature** — Removed custom tag creation across web, mobile, and backend — tags are now added from the existing predefined list only.
- 🐛 **Bug** — Fixed cup-hint detection and embedded-unit scaling to catch mid-sentence quantities (e.g. "dissolved in 2 cups simmering water"), not just the leading one.
- 🐛 **Bug** — Recipes with ingredients and steps split across separate components (e.g. "For the paste" / "For the pork" sections sharing one instruction list) are no longer rejected as incomplete.
- 🐛 **Bug** — Fixed concurrent recipe re-imports timing out after 15-30s by reusing a single shared fetch session instead of opening a new one per request.
- 🐛 **Bug** — Fixed tag editing on recipe details: removal was silently disabled outside edit mode, the picker always said "Add tag" even when removing, and the backdrop had no tap-to-dismiss.
- 🐛 **Bug** — Ingredient group collapse toggle moved to the INGREDIENTS row so steps and title always stay visible; all groups (not just extra ones) are now collapsible.
- 🐛 **Bug** — Fixed recipe detail total-time stat wrapping onto two lines by compacting the format (e.g. "2h30m").
- 🐛 **Bug** — Personal library link is now scoped per user instead of a single shared flag, so one household member sending a recipe to their personal library no longer hides that option for everyone else.
- 🐛 **Bug** — Fixed star icon vertical alignment on the recipe detail screen for single-line titles.

### Households & sharing

- 🐛 **Bug** — Household avatar in the Recipes header now shows a loading spinner instead of silently falling back to the personal avatar while households are still fetching.

### Apps & platform

- ✨ **Feature** — Mobile: next-meal card now scrolls with the recipe list instead of staying pinned under the header.
- ✨ **Feature** — Mobile: tag picker now uses a native-style rounded search field and shifts above the keyboard while typing; the sheet's backdrop tint was removed and its card is now fully rounded with selected tags sorted first.

## [1.0.4] — 2026-07-15

### Recipes & importing

- ✨ **Feature** — Unified ingredient list: recipes with multiple ingredient groups (e.g. Main and Sauce) now show one combined list at the top, with each group also available as its own collapsed-by-default section.
- ✨ **Feature** — Recipe import placeholders now dismiss instantly with optimistic UI updates, instead of waiting on the server round-trip.
- 🐛 **Bug** — Fixed household recipe sharing: recipes already in a household no longer offer "send to household" and can instead be added to your personal library.
- 🐛 **Bug** — Recipes with only one ingredient group no longer show a duplicated ingredients section.
- 🐛 **Bug** — Fixed the mobile share-extension handoff for importing recipes from other apps.
- 🐛 **Bug** — Recipe re-imports no longer get spuriously skipped as 429/rate-limited on Shopify-hosted recipe sites; page fetching now impersonates a real browser TLS fingerprint.
- 🐛 **Bug** — Recipe extraction now retries on invalid Gemini enrichment responses and falls back gracefully on malformed fields instead of failing the whole import.
- 🐛 **Bug** — Recipe import failures are now reported to Sentry for monitoring.

### Households & sharing

- 🐛 **Bug** — Refined the household sharing menu's send-to-household and send-to-personal-library options to correctly reflect a recipe's current household state.

### Apps & platform

- 🐛 **Bug** — Fixed cooking-mode preference sync between the recipe detail screen and app settings, which previously could disagree with each other.
- 🐛 **Bug** — Mobile app now respects the system's dark/light appearance setting on startup instead of defaulting to light.
- 🐛 **Bug** — Fixed remaining mobile dark-mode appearance issues on the meal plan screen and theme colors.
- 🐛 **Bug** — Removed the internal debug mode toggle and its associated UI/config, now that its testing purpose is complete.

## [1.0.3] — 2026-07-15

### Recipes & importing

- ✨ **Feature** — Recipe imports now continue in the background, immediately showing a placeholder and opening the recipe once processing completes.
- ✨ **Feature** — Added cooking-time estimates to recipe nutrition stats.
- 🐛 **Bug** — Recipe lists and the next-meal card now wait for authentication before loading, avoiding false errors on a fresh start.
- 🐛 **Bug** — Household recipe avatars now identify the member who added the recipe rather than the viewer.
- 🐛 **Bug** — Improved recipe import extraction reliability and support for concurrent reimports.

### Meal planning

- ✨ **Feature** — Add quick plain-text meals such as “Frozen pizza” alongside recipe-backed plan entries, in personal and household plans on web and mobile.
- 🐛 **Bug** — Mobile meal-plan picker now respects the top safe area while attaching cleanly to the bottom of the screen.
- 🐛 **Bug** — Restyled the mobile picker search and quick-meal fields for clearer contrast and native iOS appearance.

## [1.0.2] — 2026-07-14

### Apps & platform

- ✨ **Feature** — Moved the mobile recipe add action into a persistent orange glass button, matched the Meal Plan “Today” control to it, and added haptic feedback for both actions and successful recipe additions.

## [1.0.1] — 2026-07-14

### Ingredients, units & nutrition

- ✨ **Feature** — Adjust recipe servings with a serving stepper that recalculates ingredient quantities live on web and iOS, including scaled shopping-list additions.

## [1.0.0] — 2026-07-14

First public release. Carrot is a cross-platform recipe manager with a FastAPI
backend, a React web app, and a React Native (Expo) iOS app sharing a common
`@carrot/shared` package.

### Recipes

- ✨ **Feature** — Save, edit, and remove recipes with title, servings, and calories.
- ✨ **Feature** — Import recipes from any URL via Gemini extraction, including social platforms (Instagram/TikTok) through an image proxy.
- ✨ **Feature** — Clickable image editor when adding or editing recipes.
- ✨ **Feature** — Persist and display the original source URL; recipe title doubles as a clickable source link.
- ✨ **Feature** — Recipe search on the Recipes page via an overlay dropdown, matching both titles and ingredients.
- ✨ **Feature** — Full tagging system with a tag filter bar, plus grouped filters (Protein / Carb / Cuisine / Time) and a native menu-based category filter.
- ✨ **Feature** — Per-user favourites with a star toggle and favourites-only filter.
- ✨ **Feature** — Sortable recipes table with drag-to-reorder, sticky columns, and per-row action menus (web).
- ✨ **Feature** — Private per-recipe notes with independent auto-save.
- ✨ **Feature** — CSV export/import of recipes from Settings.
- 🐛 **Bug** — Fixed a crash when saving a recipe with no tags.
- 🐛 **Bug** — Fixed a crash when importing certain recipe pages.
- 🐛 **Bug** — Fixed ingredient pills sometimes matching the wrong ingredient in recipe steps.

### Ingredients, units & nutrition

- ✨ **Feature** — Typed unit system with a structured ingredient editor and per-user unit preference.
- ✨ **Feature** — Dual metric and imperial recipe units.
- ✨ **Feature** — Inline ingredient pills and inline timer chips inside recipe steps.
- ✨ **Feature** — Nutrition boxes (protein/fat/carbs/kcal) with `g` suffixes and a tap-to-reveal disclaimer tooltip.
- 🐛 **Bug** — Fixed ingredient unit parsing fallback and dual-unit recipe view wiring.
- 🐛 **Bug** — Removed the invalid "piece" recipe unit.

### Allergies & intolerances

- ✨ **Feature** — Allergies & intolerances feature with allergen/intolerance/custom accordions and full descriptions.
- ✨ **Feature** — One-tap allergen substitution that also adjusts volume and weight measurements, with a confirmation checkmark.
- 🐛 **Bug** — Fixed allergen detection being discarded on JSON-LD recipe pages and on import.
- 🐛 **Bug** — Fixed substitution replacing quantity/unit alongside the ingredient name.

### Meal planning

- ✨ **Feature** — Meal plan with a calendar view, day list, and recipe picker.
- ✨ **Feature** — Full monthly calendar grid on desktop; compact month-nav header on mobile.
- ✨ **Feature** — Export meal plan as styled xlsx and print as A4 portrait.
- 🐛 **Bug** — Fixed meal-plan auto-centering across multiple layout/coordinate-space issues (mobile).
- 🐛 **Bug** — Fixed calendar meal-dot injection for `en-GB` date formats and missing dot on today.

### Timers

- ✨ **Feature** — Step timers with a global timer context, settings, and a bell notification dropdown showing running timers.
- ✨ **Feature** — Timers persist through page reload via a service worker; expired-timer popup with accumulation and a "Go to step" action.

### Households & sharing

- ✨ **Feature** — Household feature: shared libraries, invitations, member management, and a household switcher.
- ✨ **Feature** — Send a personal recipe to a specific household from the recipe detail header; import household recipes to a personal library.
- ✨ **Feature** — Household indicators — colored initials avatars and theme dots — on recipe cards and detail views.
- ✨ **Feature** — Invitation polling so the notification bell updates without a manual refresh.
- 🐛 **Bug** — Surface the real error when sending a recipe to a household fails.

### Accounts & auth

- ✨ **Feature** — Account registration and login.
- ✨ **Feature** — Self-service in-app account deletion, plus a Privacy Policy link in Settings.
- 🐛 **Bug** — Network errors now show a clear, friendly message instead of a raw failure.
- 🐛 **Bug** — Fixed accessibility (WCAG AA) issues on the login and register pages.

### Internationalization

- ✨ **Feature** — Full i18n support (English, Polish, German, French, Spanish) via react-i18next, including default tags and unit names.

### Apps & platform

- ✨ **Feature** — Native iOS app (Expo) alongside the web app, sharing recipes, meal plans, and households through one account.
- ✨ **Feature** — Rebranded to Carrot with new name, icons, and brand color, plus a marketing site at carrot.xcxz.xyz.
- 🐛 **Bug** — Recipe thumbnails now stay cached, eliminating the image flash when opening a recipe's detail view.

[1.0.4]: https://github.com/
[1.0.3]: https://github.com/
[1.0.2]: https://github.com/
[1.0.1]: https://github.com/
[1.0.0]: https://github.com/
