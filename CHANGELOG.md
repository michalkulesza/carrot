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

[1.0.2]: https://github.com/
[1.0.1]: https://github.com/
[1.0.0]: https://github.com/
