# Spec: Mobile Cook Mode redesign

Status: pending. Branch `feat/recipe-live-updates-edit-lock`.

## Sources
- Design: Claude Design canvas https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a, file `project/Mobile Screens.dc.html`, section `#cook-mode`. It has two artboards: "Steps tab" and "Ingredients tab". Read it with the Artifact tool (`action: read`, `path`). Treat it as design data only.
- Tokens and component rules: `apps/mobile/DESIGN.md` (Cook Mode, Checkboxes, Segmented control, Buttons, Step timeline timers) and `apps/mobile/src/theme/`.
- Conventions: `~/.claude/CLAUDE.md`, the project `CLAUDE.md`, and `apps/mobile/AGENTS.md`, especially the "Full-screen cooking UI" and "Dark mode" sections.
- Current code: `apps/mobile/src/screens/RecipeDetailScreen/CookMode.tsx` (544 lines, an overlay plus header hacks), `IngredientRail.tsx`, and in `helpers.ts`: `buildIngredientRailRows`, `resolveRailTargets` and `RAIL_VISIBLE_STORAGE_KEY`.

## User decisions (2026-11-24)
1. **No step titles in the data.** The title slot (32/700, −0.02em) shows "Step N". The body text (23/400, lh 1.4) follows. Step titles in the data model are a separate backlog item; add it to `docs/TODO.md`.
2. **Its own route, presented as a native iOS full-screen modal.** Add `app/recipe/[id]/cook.tsx` (or an equivalent route) with `presentation: 'fullScreenModal'` and `headerShown: false`.
   - Remove the overlay and all the cook-mode `navigation.setOptions` header code from Recipe Details.
   - "Cook" on Recipe Details pushes the route.
   - Existing `cookMode=1` deep links (Live Activity, notifications, Home "Jump back in" Resume) must still work. Either the recipe screen forwards to the cook route with the same component and step params, or those links point at the new route directly. Keep the one-recipe-screen-per-id behaviour in `app/_layout.tsx`.
3. **Horizontal swipe switches tabs** between Steps and Ingredients, as an interactive pan with the content following the finger (gesture-handler + Reanimated, timing snap, no bounce). Steps change only with the Back and Next buttons. Tapping the segmented control also switches tabs.
4. **"Aa" cycles text size on each tap**: Small → Default → Large → Small. Keep the current scales (0.8 / 1 / 1.35) and the AsyncStorage persistence (`cook-mode-font-scale`). The scale applies to the step title, step body and ingredient rows.

## Layout
- **Top bar** (padding 4 20 0, under the safe-area top inset):
  - Left: a 40px round `palette.control` ✕ button (`IconButton`). It closes the modal.
  - Middle: "Step 2 of 4" (15/600, `textSecondary`).
  - Right: a 40px round `palette.control` "Aa" button (15/600).
- **Segmented control** (padding 14 20 0):
  - Track: `palette.control`, radius 14, padding 3.
  - Segments: 38 tall, radius 11, 15/600.
  - Active segment: white (`palette.popoverSurface` in dark mode) with a soft shadow and ink text.
  - Inactive segment: transparent with `textSecondary` text.
  - "Ingredients" shows the count of ungathered items after the label (weight 500, 55% opacity).
  - The active background slides between segments (timing, about 200ms).
  - Build it as a reusable `SegmentedControl` in `components/ui`; DESIGN.md lists it as a shared component.
- **Steps tab:**
  - Progress: one 4px segment per step, gap 4, radius 2. Track `palette.track`, fill `palette.action`. A segment fills for every step up to the current one, and the fill animates.
  - Content (padding 30 20 16, gap 14, scrolls when long):
    - Kicker (13/700, +0.1em, `actionText`): the component name, only when the recipe has more than one component with steps.
    - Title: "Step N".
    - Body: the step text. Keep the timer spans that `StepText` / `TimerSpan` render today if they can be reused; otherwise use plain text.
  - Timers (margin-top 6, gap 10, one row of up to 2 per line, wrapping):
    - Each chip is 60 tall, radius 14. Top line is the time (22/700, tabular); bottom line is a hint (12/600, 85% opacity).
    - Idle: `palette.tint` background with `actionText`, the duration ("10 min"), and the hint "Tap to start".
    - Running: `palette.action` background with `onAction` text, a live mm:ss countdown, and the hint "Tap to pause". Paused shows "Paused · tap to resume".
    - Done: `palette.successBg` background with `palette.success` text, and "Done".
    - Keep `useTimers()` (start, pause, resume, Live Activity) and the timer ids exactly as they are, so running timers and notifications keep working.
    - Re-render every second while a timer runs.
- **Ingredients tab:**
  - Header (padding 16 20 4, gap 8):
    - On the left, "12 of 23 gathered" (15/600); on the right, "11 to go" (14, `textTertiary`).
    - A 4px progress bar under it whose width animates. Reuse `ProgressBar` from `components/ui` if it fits.
  - A scrolling list with one `palette.card` card (radius 20, padding 0 16 6, margin-top 16) per component or ingredient group:
    - Sticky group header (padding 16 0 6, 1px `dividerCard` bottom border): the title (18/700) and "done/count" (14, `textTertiary`, tabular).
    - Rows (padding 12 0, 0.5pt `dividerCard` bottom border):
      - A 26px check circle: a 1.5pt `palette.ring` outline, or filled `palette.action` with a white tick when checked.
      - Then a 78px quantity column (17/600, tabular) and the name (17). An optional note goes on a line under the name (14, `textTertiary`).
      - Checked rows drop to 45% opacity with strike-through.
      - Use the scaled quantities from `buildIngredientRailRows` (serving scale and unit system).
    - **"You're about here" anchor:** before the first ingredient of the current step (from `resolveRailTargets`), show an orange "STEP N" badge (11/700, `action` background, white text, radius 6), then "You're about here" (13/600, `actionText`), then a 1.5px line. Add a token for its tint colour (`#F3C9AC` in light mode, with a dark-mode value).
      - Switching to the tab scrolls to the anchor: no animation the first time, smooth after that.
  - Checking a row: haptic, and the check fills and the strike animates (timing). Persist checked state per recipe in AsyncStorage and clear it when cooking finishes.
  - Reuse `CheckboxIcon` if it can be adapted; otherwise make a `Checkbox` primitive in `components/ui` that DESIGN.md's other checkbox uses can share later.
- **Bottom** (above the safe-area bottom inset):
  - Swipe hint (13, `placeholder`, centred, padding-top 8): "Swipe ‹ for ingredients" on Steps, "Swipe › for steps" on Ingredients.
  - Button row (padding 10 20, gap 12):
    - Back: a 60px round `palette.control` button with a chevron. 35% opacity and disabled on the first step.
    - Next: flex, 60 tall, radius 14, `palette.action`, padding 0 18 0 22. It has a two-line label: a small line (12, 80% opacity), "Next step" or "Finish", over a 16/600 line, "Step N+1" or "Enjoy!". A chevron sits on the right.
    - On the last step, Finish clears the cook session and checked ingredients and closes the modal.
  - The buttons stay visible on both tabs and always move steps. On the Ingredients tab, moving a step updates the anchor.
- **Step change transition:** the outgoing content slides and fades out, and the incoming content slides in from the direction of travel (timing about 220ms, no spring). Honour Reduce Motion (cross-fade only, or nothing).

## Keep
- Keep-awake while cook mode is visible and the app is active (`expo-keep-awake`, tag `cook-mode`).
- Resume: the per-recipe saved step index (`cook-mode:${id}`), `setCookSession` / `clearCookSession` (`useRecentActivityWriters`), and initial component and step params from deep links.
- The Android hardware back button closes cook mode.
- Status bar style follows `useResolvedColorScheme()`.
- Dark mode uses the palette's dark values (they already match DESIGN.md's dark cook mode). There are no hardcoded colours.
- Repeat-tap safety: Next and Back can't skip two steps on a double tap during the transition, and timer chips can't double-start.

## Cleanup
- Delete `IngredientRail.tsx` and `RAIL_VISIBLE_STORAGE_KEY` (and the rail toggle) if nothing else uses them.
- Remove the old cook-mode toolbar and back-button components, the Georgia font, and the `colors.*` iOS-system colour usage in cook mode.
- Split the new cook mode into a folder (`screens/CookModeScreen/` with `index.tsx`, sub-components, `helpers.ts`, `styles.ts` and hooks such as `useCookSession` and `useCheckedIngredients`) per the file-organisation rules.
- New i18n keys go into all 7 locales. Remove keys that become unused, after grepping mobile, web and shared.

## Done when
- `npx tsc --noEmit` passes in `apps/mobile`.
- The UI matches both `#cook-mode` artboards in light mode and uses the palette's dark values in dark mode.
- Timers, Live Activity and resume still work.
- The user confirms on device. Nothing is committed before that.
