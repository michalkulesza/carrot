# Recipe detail: cheap first frame, rest after the push

## Problem
Opening a recipe (`apps/mobile/app/recipe/[id].tsx` → `src/screens/RecipeDetailScreen`) mounts the
whole tree during the native push transition (`ReadView.tsx` ~98–188): hero, every ingredient group,
all steps, notes, related recipes, `AddToMealPlanSheet`, `IngredientSwapSheet`, `GroceryModeBar`.
- Each `IngredientRow` creates ~18 shared values / animated styles (`useGroceryRowAnimation.ts`).
- Multi-component recipes render an extra collapsed "All ingredients" card whose rows are all
  mounted (`IngredientsSection.tsx` ~56); `components/ui/Expandable.tsx` (~80–84) keeps children
  mounted while collapsed.
- Every `StepRow` has a Reanimated `layout` prop (`StepRow.tsx` ~73).
- Four `FadeSection` wrappers each run an `entering` animation (`FadeSection.tsx` ~8).

## Goal
The push animation stays smooth and the first frame shows instantly; the rest appears right after.

## Changes
1. **Staged mount.** First render: hero, title, meta/nutrition strip, and the first visible part of
   the content (e.g. ingredients header + first group, or a cheap placeholder of the same height so
   the scroll position/layout doesn't jump). Mount the remaining ingredient groups, steps, notes
   and related recipes once the transition ends (`navigation.addListener('transitionEnd')`, with an
   `InteractionManager.runAfterInteractions` fallback when there's no transition, e.g. deep link or
   cook-mode return). Put this in a small reusable hook (e.g. `src/hooks/useAfterTransition.ts`).
   Deep links / timer notifications that target a step (`cookMode`, `stepIndex`, `navAt` params,
   `useScrollToStep`-style logic) must still land on the right step: content needed for scrolling
   must be mounted before the scroll runs.
2. **Collapsed content not mounted.** `Expandable`: add an opt-in `lazy` (mount children on first
   expand, keep mounted after) and use it for the "All ingredients" card. Check other `Expandable`
   users keep current behaviour (default off).
3. **Sheets mount lazily.** `AddToMealPlanSheet` and `IngredientSwapSheet` render only after their
   first `present()` request (keep the ref API working: present → mount → present on next frame);
   check `AppSheet`/`BottomSheetModal` constraints in `src/components/ui/sheet.tsx`.
4. **Cheaper rows.** Drop `layout` on `StepRow` unless a feature needs it (check done-step collapse /
   reorder); if needed, enable it only after the first mount. In `useGroceryRowAnimation`, create the
   animation values lazily or only when grocery mode is active, if that's a straightforward change
   that preserves the animation; otherwise leave it and report.
5. **Entering animations.** With the staged mount, sections entering after the transition should
   still fade in (use `useMotion` / reduced motion); sections present on the first frame shouldn't
   animate during the push.

## Constraints
- Behaviour and look identical once loaded: grocery mode, ingredient swap, servings scaling,
  timers, allergens, related recipes, scroll-to-step, cook mode entry, editing.
- Respect reduced motion. No layout jump on the hero.
- Follow the repo conventions (~/.claude/CLAUDE.md, apps/mobile/AGENTS.md).

## Verification
`npx tsc --noEmit` in apps/mobile. Manual on device: open short and long multi-component recipes,
open from a timer notification / Home timer row (lands on step), grocery mode, swap sheet, add to
meal plan, VoiceOver order.
