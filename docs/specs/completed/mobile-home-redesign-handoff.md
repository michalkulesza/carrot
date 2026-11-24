# Handoff: Mobile Home redesign

Status as of 2026-11-24. Branch: `feat/recipe-live-updates-edit-lock`, uncommitted on top of `68cebcbf`.

- `npx tsc --noEmit` in `apps/mobile` passes. `packages/shared` typecheck passes.
- **Nothing has been run on a simulator yet.**
- **Nothing is committed.** The user must confirm on device before anything is committed (project rule).

## Read first
1. `docs/specs/completed/mobile-home-redesign.md`: the full spec. It was updated as decisions changed, so it matches the code.
2. `apps/mobile/DESIGN.md`: the design tokens and component spec, and the source of truth for look and feel. It is new and untracked; commit it with this work.
3. `apps/mobile/AGENTS.md` and `~/.claude/CLAUDE.md`: conventions. Native-first, PlatformColor/DynamicColorIOS, no comments, extraction rules, i18n in all 7 locales, repeat-tap safety.
4. Design source: the Claude Design canvas https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a, page "Mobile Screens", sections "Home" and "Add recipe". Read it with the Artifact tool (`action: read`, `path: project/Mobile Screens.dc.html`).

## What was built
- **Theme**: `apps/mobile/src/theme/`
  - Files: `colors.ts` (new `palette` of DESIGN.md roles via `DynamicColorIOS`, with derived warm dark values), `spacing.ts`, `radius.ts`, `typography.ts`, `motion.ts`, `gradients.ts`, `index.ts`.
  - `motion.ts` contents:
    - `useMotion()`, which returns `undefined` animations under Reduce Motion.
    - `usePressScale`.
    - `layout` is a plain 200ms transition with no spring.
    - `expandTiming` is 260ms ease-out.
- **UI primitives**: `apps/mobile/src/components/ui/`
  - Components: `AppText`, `Button`, `IconButton`, `Card`, `CardRowList`, `Thumbnail`, `ProgressBar`, `SectionHeader`, `RecipeTile`, `IconCircle`, `Expandable`. They are variant-driven and use theme tokens only.
  - `Button` ignores presses while an async `onPress` is pending.
  - `IconCircle` has tones `neutral`, `error` and `attention`.
  - `Expandable` animates height and opacity, so content below slides with no bounce.
- **Home**: `apps/mobile/src/screens/HomeScreen/`
  - `TonightCard` / `TonightEmptyCard`:
    - The photo card has an Open button (no icon) that opens the recipe, not cook mode.
    - The empty card has "Plan tonight" and "Open meal plan".
    - "Plan tonight" goes to the Meal Plan tab with the `planToday` param. MealPlanScreen then scrolls to today and opens `RecipePicker` for today.
  - `ImportsCard` / `ImportRow` / `useImportJobActions`:
    - The import list is one expandable card.
    - Running jobs show an indeterminate bar.
    - Failed and duplicate jobs show a 28px `!` badge instead of buttons. Tapping the row opens the ActionSheet (Retry, Import anyway, Go to recipe, and so on).
    - The card auto-expands when the number of jobs needing attention rises.
  - `JumpBackInCard`: Resume for the unfinished cook session, Open for the last-viewed recipe. Data comes from `src/storage/recentActivity.ts` and `src/hooks/useRecentActivity.ts`, which are local AsyncStorage. CookMode and RecipeDetailScreen write to it.
  - `RecipeShelf`: 148px `RecipeTile`s for Recently added and Favourites.
  - `useHomeHeader`:
    - The household switcher title is `HouseholdHeaderTitle` with `prominent`.
    - The **Add button is a native iOS 26 prominent bar button**: `unstable_headerRightItems`, `variant: 'prominent'`, `tintColor: palette.action`, which gives tinted Liquid Glass. It is `type: 'button'`; its `onPress` opens the custom Add recipe popover (user decision, replaces the native menu).
    - The popover (`HomeScreen/AddMenuPopover`, data from `useAddMenu.ts`) has: clipboard row (conditional), Import from link, Take photo, From photos, Paste text, From personal library (conditional), Write from scratch.
  - Animation rule from the user: sections fade in only. **No layout or spring animations on sections.** The user found them too bouncy.
- **Add recipe sheets**: `apps/mobile/src/components/AddRecipeDrawer/`
  - Its handle is `present('link' | 'text' | 'personal-library', { url? })`.
  - It contains `LinkSheet`, `TextSheet`, a restyled `PersonalRecipePickerView` and `SheetInput`.
  - Shared logic lives in `useAddRecipeActions.ts` and `usePersonalRecipesToLink.ts`.
  - The old method picker is gone. The share sheet and Browse still open the link sheet through `openAddRecipe=1`.
- **Meal plan picker**: moved to `src/components/RecipePicker/`. Its logic is in `src/hooks/usePlanMealForDate.ts`, used by MealPlanScreen.
- **i18n**: new `home.*`, `home.imports.*`, `addMenu.*` and `addRecipe.*` keys in all 7 locales under `packages/shared/src/locales/`. Unused keys were removed after a grep across mobile, web and shared.
- **Removed as dead code**: `FloatingAddButton`, `HomeRecipeCard`, `NextMealCard`, `ImportJobsSection`, `PendingJobCard`, `AddMenuButton`, the drawer's `MethodPickerView`, `QuickUrlInputRow` and `TextPasteView`, plus `useImportPreview` and `importImagePreviews`. Nothing displayed import previews any more.

## Remaining work
1. **Verify on an iOS 26 simulator** with `pnpm be+ios` and fix whatever is off. Use the checklist at the end of the spec. Highest risk:
   - The native prominent Add button: it should show as a single tinted glass circle, its menu should work, and the clipboard item should appear after copying a link and returning to Home. Also check how it falls back below iOS 26.
   - Imports expand and collapse: smooth height animation, with no clipping when rows are added while expanded.
   - "Plan tonight" when the Meal Plan tab has never been mounted: the picker must still open once the tab is ready.
   - "Jump back in": Resume should land on the saved step. Resume uses `cookMode=1` without step params, and CookMode restores the step itself.
   - Dark mode. The palette dark values were contrast-checked by eye only.
2. A native-speaker skim of the pl, de, fr, es, it and pt strings. They were machine-written.
3. Once the user confirms on device, commit everything with `DESIGN.md` and the spec, then move the spec (and this handoff) to `docs/specs/completed/`.

## Known caveats and decisions
- `IconButton` and `Button` exist for upcoming screens (Browse, Recipe Details), which should reuse `src/components/ui` and `src/theme`.
- The clipboard row has a generic subtitle, because reading the clipboard would trigger the iOS paste prompt. It is detected with `hasUrlAsync()` (refreshed when the popover opens and on app foreground) and read only when Import is tapped. iOS has no permanent clipboard permission; users can set Settings > Carrot > Paste from Other Apps > Allow.
- Import progress is indeterminate, because the backend has no progress percentage.
- The Tonight kicker can't say "DINNER": there is no meal-type field. It shows TONIGHT, TOMORROW or the weekday, plus the cooking time.
- Pre-existing locale gaps were left alone: pl is missing `addRecipe.foundIngredients_one` and `addRecipe.foundSteps_one`; it and pt are missing `importJobs.cancelImport`; there are stray `_many` keys in fr, es, it and pt.

## Commands
- Typecheck: `cd apps/mobile && npx tsc --noEmit`, and `pnpm --filter @carrot/shared typecheck`.
- Run: `pnpm be+ios`. This starts the API, the database and the worker in Docker, then the iOS app.
