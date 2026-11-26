# Ingredient swap (mobile Recipe Details)

Status: completed

## Goal

On mobile Recipe Details, an ingredient that contains one of the user's active allergens and has a
recommended substitute can be swapped in place. The allergen label under the ingredient becomes a
button; tapping it opens a short sheet that shows the change as before → after, with a
"Swap everywhere" switch. Confirming rewrites the ingredient with a strike-and-rewrite animation,
and the row then shows "Swapped · was soy sauce" with Undo. One recommendation per ingredient (no
choice between substitutes).

Design: artboard "Ingredient swap" (sheet + strike & rewrite) in the Carrot design artifact,
`project/Mobile Screens.dc.html`. Values below are copied from it (CSS px = pt).

## Existing behaviour to build on

- Ingredient entries carry `allergenFlag` (`AllergenFlag`: `allergen`, `substitute`,
  `substitute_applied`, `original_display`, `original_values`) — see
  `apps/mobile/src/screens/RecipeDetailScreen/helpers.ts` (`buildIngredientGroups`) and
  `IngredientRow.tsx`, which today renders an `AllergenBadge` ("Gluten · swap tamari" label +
  tooltip) when the flag matches an active allergen.
- Web already applies and restores substitutions:
  `apps/web/src/components/RecipeDetailModal/helpers.ts` (`applyIngredientReplace`,
  `applyIngredientRestore`) using `packages/shared/src/utils/ingredientSubstitution.ts`
  (`substituteIngredient`), saved via `updateRecipe(id, buildRecipeUpdateFromRecipe(...))` in
  `RecipeDetailModal/index.tsx` (`applySubstitutionUpdate`). Mobile must reuse the same data model
  and shared util; move the apply/restore helpers into `packages/shared` so web and mobile share
  them (web keeps working unchanged).

## Behaviour

1. **Chip.** When an ingredient's flag matches an active allergen AND has a `substitute` AND is not
   applied, the allergen label becomes a button: "{Allergen} · swap for {substitute name}" with a
   swap SF Symbol (`arrow.left.arrow.right`) after the text. Style: height 30, paddingHorizontal 10,
   radius 8, bg allergen tint (`palette.allergen`, #FFF2D1), text `palette.allergenText` (#7A4E00),
   13pt semibold, gap 6, marginTop 4, alignSelf flex-start; hitSlop to reach 44pt. Without a
   substitute, keep today's non-interactive badge/tooltip.
2. **Target row highlight while the sheet is open:** row background #FFF4EA (`palette.todayCard`),
   radius 12, padding 11/8 with margin 0/-8 (so text doesn't shift), chip bg darkens to #FFE3A3
   (pick/add a theme token). Animate background ~300ms.
3. **Sheet** (`@gorhom/bottom-sheet` `BottomSheetModal` with the shared look from
   `src/components/ui/sheet.tsx`, `enablePanDownToClose`, dynamic sizing; follow
   `apps/mobile/AGENTS.md`). Padding 10/20/34(+safe area as other sheets do), gap 14:
   - Title 22pt bold: "Swap for a {allergen}-free option?" (e.g. "gluten-free").
   - Before → after card: padding 14, radius 20, bg `palette.card` (#F7F5F2):
     - line 1: "{qty} {old name}" 14pt secondary, strikethrough;
     - line 2: orange arrow icon (`arrow.right`, `palette.actionText`) + "{qty} {new name}" 18pt bold;
     - line 3: "{Allergen}-free · same amount" 14pt secondary.
     Quantities shown are the CURRENT displayed (serving-scaled, unit-system-converted) quantity.
   - "Swap everywhere" row (only when other un-applied matching ingredients exist — same allergen
     and same base ingredient name, e.g. soy sauce in "Bulgogi beef" and "Drizzle sauce"):
     min-height 56; title 16pt medium "Swap everywhere"; subtitle 13pt secondary
     "{n} places · {Group A} + {Group B}"; native `<Switch>` on the right, ON by default, tinted
     `palette.action`.
   - Buttons row, gap 8: "Keep" (flex 1, h54, radius 14, `palette.control` bg, ink 16pt semibold,
     closes the sheet — kept deliberately per user decision despite the AGENTS.md dismiss-button
     rule) and confirm (flex 2, h54, radius 14, `palette.action` bg, white 16pt semibold):
     "Swap to {new name}" or "Swap {n} to {new name}" when the switch is on and n > 1.
4. **Confirm:** close the sheet, success haptic, optimistically update the displayed recipe, then
   save via the same recipe update API the web uses (apply `substituteIngredient` for every
   targeted ingredient in one update). Each changed row plays the strike & rewrite animation; when
   several rows change, stagger them (the design delays the second by a beat, ~150ms each).
   On failure: roll back, Alert with `common.somethingWentWrong` (or the existing
   `recipes.failedToApplySubstitute`). Handle `recipe_locked` / `recipe_changed` conflicts the way
   the screen already does for edits (show the lock alert / reload). Repeat-tap safe (one save in
   flight per confirm; chip disabled while a save for that row is pending).
5. **Strike & rewrite animation** (react-native-reanimated, honour reduced motion = instant):
   - strike: 2pt line at 52% height of the old name, colour `palette.error` (#B3261E), scaleX 0→1
     from the left, 260ms ease-out, start 0ms;
   - old block (name, note, chip): opacity 1 → 0 and translateY 0 → -4 between 55% and 100% of a
     600ms timeline, start 0ms;
   - new block: opacity 0 → 1 (design also blurs 5px → 0; skip blur if not cheap), 380ms ease-out,
     start 480ms;
   - highlighter mark under the new name: 9pt tall, radius 3, colour #F8C9A4 (add a theme token,
     with a dark-mode counterpart), from left -2 to right -2, bottom 1, behind the text; scaleX 0→1
     over the first 55% then fades out by 100% of 1100ms ease-out, start 560ms.
   Old and new blocks are stacked in the same space during the animation; the row height settles to
   the new block.
6. **Swapped row state** (after animation, and on load for already-applied flags):
   new name 16pt (no note line — removed by the user), then a row (gap 8,
   marginTop 4): a success pill (h28, paddingHorizontal 9, radius 8, bg `palette.successBg`
   #E3F5E7, text `palette.success` #1F7A3A, 13pt semibold, 12pt checkmark icon, gap 5)
   "Swapped · was {old name}", and an "Undo" text button (h28, paddingHorizontal 4, 13pt semibold,
   `palette.actionText`). Undo restores that ingredient (shared `applyIngredientRestore`), saves,
   with optimistic update + rollback + alert on failure, repeat-tap safe.
7. **Undo toast:** dropped by the user; there is no confirmation toast after a swap. Undo is only available from the swapped row, and it plays the same crossfade as the confirm animation without the strike line or highlighter mark.
8. **Shopping list / grocery mode** use the swapped ingredient text automatically (they read the
   recipe's current ingredient values) — verify.
9. **Accessibility:** chip `accessibilityRole="button"`, label
   "{Allergen}. Swap {old} for {new}"; sheet title announced; switch labelled; swapped pill +
   Undo labelled ("Undo swap, restore {old}").
10. **Strings:** all new text via `t()` in en, pl, de, fr, es, it, pt (Polish plural forms where a
    count is shown). Reuse existing keys where they fit (`recipes.allergenSwap`,
    `recipes.failedToApplySubstitute`, `recipes.failedToRestoreIngredient`, `common.undo`).

## Out of scope

- Choosing between multiple substitutes; the "make the whole recipe X-free" banner action;
  web UI changes (beyond moving shared helpers); backend changes.

## Verification

- `npx tsc --noEmit -p .` in `apps/mobile` and `apps/web` pass.
- Manual: swap one, swap everywhere (2+ rows), Undo from row, change servings
  after swap, dark mode, reduced motion, rapid double taps on chip / confirm / Undo, save failure
  (airplane mode) rolls back.
