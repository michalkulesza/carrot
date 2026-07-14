# Useful Home v1 — Next Planned Meal

## Summary

Add a next-planned-meal card to the existing Recipes landing experience. Do not introduce or rename a Home tab; broader dashboard ideas remain deferred.

## Implementation Changes

### Data and API

- Add `GET /api/meal-plan/next?from=YYYY-MM-DD`, returning the earliest meal-plan entry on or after the client’s local date, or `null`.
- Scope results to the active personal or household context with unlimited look-ahead. No database migration is required.
- Add a shared API method and React Query hook using `MealPlanEntry`.
- Refresh the query after meal-plan mutations, household switches, retries, and local midnight.

### Native mobile

- Fix the card below the Recipes tag filters, outside the scrolling list.
- Hide it with the filters while search is active and include it in the animated header height.
- Open `/recipe/[id]` when populated; open Meal Plan from the empty CTA.
- Use semantic native styling, a 44-point target, light haptic feedback, thumbnail/fallback icon, and chevron.

### Web

- Show the expanded card above desktop sidebar navigation.
- Reduce it to an accessible meal/calendar icon when the sidebar is collapsed.
- On narrow web, place it above the Recipes filters and let it scroll with the page.
- Open `/?recipe=<id>` for the existing recipe modal; route empty-state taps to `/plan`.

### Card states and copy

- Populated: “Next planned meal”, recipe title, thumbnail, chevron, and date.
- Dates: localized “Today”, “Tomorrow”, then a localized short date such as “12 Jan”.
- Today’s meal remains current until local midnight.
- Empty: “No upcoming meal” with an action to open Meal Plan.
- Loading: compact layout-preserving skeleton.
- Error: “Couldn’t load next meal” with retry.
- Add strings to English, Polish, German, French, and Spanish locale files.

## Public Interfaces

- `GET /api/meal-plan/next?from=YYYY-MM-DD`
  - `200` with `MealPlanEntry` when found.
  - `200` with `null` when no entry exists.
  - `400` for an invalid date.
- Shared next-meal API client method.
- Shared `useNextMealPlanEntry` hook exposing entry, loading, error, and refetch state.

## Test Plan

- API: today wins, the earliest future entry is selected across months, past entries are excluded, empty results return `null`, invalid dates fail, and contexts remain isolated.
- Verify meal-plan mutations and household switching refresh the card.
- Native: fixed placement, search animation, every data state, navigation, localization, dark mode, and date rollover.
- Web: expanded/collapsed sidebar, narrow layout, navigation, keyboard access, and responsive behavior.
- Run shared/mobile typechecks, web lint, and web production build.

## Assumptions

- V1 contains only this next-meal capability.
- The current one-recipe-per-date model remains unchanged.
- Only the active personal/household context contributes meals.
- Narrow web intentionally allows the card to scroll away.
- Include this specification in the eventual implementation commit after user confirmation.
