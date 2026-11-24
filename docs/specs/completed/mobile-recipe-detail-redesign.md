# Spec: Mobile Recipe Details redesign (read state)

Status: completed (2026-11-25). Branch `feat/recipe-live-updates-edit-lock`. It builds on the Home redesign (`dd1320cd`) and the Browse redesign (`b33ef04f`), which added the theme tokens (`apps/mobile/src/theme/`) and the UI primitives (`apps/mobile/src/components/ui/`).

## Sources
- **Design:** Claude Design canvas https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a, file `project/Mobile Screens.dc.html`, artboard `#recipe-details` (lines ~476–630). Read it with the Artifact tool (`action: read`, `path: "project/Mobile Screens.dc.html"`). `Mobile - Recipe Details.dc.html` is exploration only.
- **Tokens and component rules:** `apps/mobile/DESIGN.md` is the source of truth, implemented in `apps/mobile/src/theme/` (`palette`, `typography`, `space`, `radius`, `motion`).
- **Conventions:** `~/.claude/CLAUDE.md`, the project `CLAUDE.md`, and `apps/mobile/AGENTS.md`.

## User decisions (2026-11-24)
1. **Tab bar stays hidden on Recipe Details.** `app/recipe/[id].tsx` stays a root-stack route, pushed over the `NativeTabs`. Don't move it into the tab stacks. The bottom bar in the mock is a placeholder.
2. **The header stays as it is.** Keep `useRecipeDetailHeader.tsx` (transparent native header, its buttons and menus, and the edit-mode header). Don't build a custom glass overlay. Small style touches to match tokens are fine, but don't change behaviour.
3. **Combine the extras with the new design.** Everything the current screen has that the mock lacks stays, restyled into the new visual language:
   - the issue banner
   - the uncertain-allergens line
   - the "AI" value provenance and the nutrition disclaimer tooltip
   - the source link on the title
   - the member row with its Delete menu
   - the keep-screen-awake switch
   - the text-size control
   - per-ingredient add-to-shopping-list
   - linked component recipes
   - the related-recipes edit picker
4. **Read state only.** EditView, CookMode and the edit-lock flow stay functionally untouched. Build the new primitives so Edit can reuse them later (for example, an optional `onRemove` or `editable` slot is fine, but don't build edit UI now).

## Goals
- **Match `#recipe-details` exactly** wherever the data supports it: spacing, radii, type, colour.
- **Reuse before create.** Extend the existing `components/ui` primitives with variants (`Button`, `IconButton`, `Pill`, `Card`, `SectionHeader`, `Thumbnail`, `RecipeTile`, `AppText`, `Expandable`) before adding new ones. New shared pieces go in `components/ui/` when they're generic (for example a stepper, a macro strip, a link chip) and in `RecipeDetailScreen/` when they're screen-specific. No raw hex, font sizes or radii in screen files. Everything comes from theme tokens.
- **Animations** use the shared `theme/motion.ts` (`useMotion`, `usePressScale`, `expandTiming`) and respect reduced motion:
  - sections fade in on mount
  - a step collapses and expands when marked done (height plus the number→check crossfade)
  - timer chips change state
  - added ingredients flip to their added state
  - related-recipe tiles animate in and out with layout transitions when the picker changes the list
  - the serves number changes with a short crossfade or slide
  - press scale on tappable tiles, chips and buttons
- **Performance:**
  - memoised rows and sections
  - stable callbacks
  - derived data in `useMemo` or pure helpers
  - no inline style objects in hot lists
  - keep the existing ScrollView (the screen is one long document), but rows must not re-render when unrelated state such as timers or serves changes
- **Quality:**
  - every string goes through `t()`, and new keys go into all 7 locales (en, pl, de, fr, es, it, pt under `packages/shared/src/locales`)
  - accessibility labels and roles on everything interactive
  - 44pt minimum hit targets
  - dark mode works through `palette` (DynamicColorIOS)
  - repeat-tap safe actions (existing mutation guards stay)

## Layout (top to bottom)
1. **Hero:**
   - Photo 296px tall, full width (keep `NetworkImage` and `Link.AppleZoomTarget`).
   - The header buttons float over it as they do today.
2. **Title block**, with padding 24/20/4 and a 16px gap between children:
   - Row: title (`typography.recipeTitle`, 28/700) with the source-link affordance kept (a small `link` symbol in `textSecondary` after the title when `source_url` exists, tapping opens it).
   - Under the title: a meta line, 15 in `textSecondary`: `creator_handle` or the source host · the household member avatar(s) and name, taken from today's `RecipeMemberRow` data. The member long-press/menu with Delete stays attached to the member chip.
   - Favourite: a 40px round `IconButton` variant `control` on the right of the title row (star / star.fill in `action`). Reuse `FavouriteButton` if it fits; otherwise add a variant.
3. **Tags:**
   - Wrapping row with a 6px gap.
   - Tint pills (`Pill` tone `tint`, size `md`: 14/500, padding 5×11, radius 14).
   - Then a "+ Tag" neutral pill that opens the existing `TagPickerModal`.
   - Remove the "×" from read-mode pills. Removing a tag happens in the picker.
4. **Warnings:**
   - `RecipeIssueBanner` restyled as a `Card` tone `attention` or `error`.
   - The uncertain-allergens line restyled as an allergen-tone inline note.
   - Both sit right after the tags.
5. **Macro strip:**
   - One `palette.card` card, radius 20, padding 12/4.
   - 5 equal columns (Time, Kcal, Protein, Fat, Carbs). Value 17/600 with tabular numerals, label 13 in `textSecondary`, separated by 0.5px `dividerStrong` hairlines.
   - Replaces `NutritionBoxGrid` here. Keep the AI provenance as a small marker on AI-estimated values (for example a `sparkle` glyph or "≈" before the value). Tapping the strip shows the existing disclaimer `TooltipPopover`.
   - Missing values show "–".
6. **Serves + Cook row** (gap 10):
   - **Stepper:** a `palette.control` box 54px tall, radius 14, padding 0 6 0 16, with the "Serves" label 16/500. The − and + buttons are 42px squares on `palette.background`, radius 10. The count is 18/600 with tabular numerals, in a 32px-wide box.
   - **Cook button:** primary `Button`, 54px tall, radius 14, `play.fill` icon, label "Cook".
   - Keep the `hasSteps` guard and the "cook mode unavailable" note.
7. **Reading prefs row:**
   - Keep-screen-awake `Switch` and the text-size control, restyled into one `palette.card` card (radius 20) with a hairline divider.
   - It sits directly under the serves row, matching the macro card style.
8. **Ingredients:**
   - `SectionHeader` "Ingredients" with padding-top 32, plus the text action "Add to list". It runs the existing add-all flow and shows its added/done state.
   - One **ingredient group card** per component: margin 16/20/0, padding 16/16/6, radius 20, `palette.card`.
     - Header: the group title (`groupTitle` 18/700, the component name, falling back to "Ingredients" for a single unnamed component), and on the right "N items" (14, `textTertiary`), above a 1px `dividerCard` line.
     - Keep today's unified/component display logic (`UnifiedIngredientsSection` vs `ComponentSection`). Both render through the same group card.
   - **Ingredient row:**
     - Grid with a 78px quantity column (17/600, tabular numerals, scaled by serves and the unit system as today), a 12px gap, then the name (17).
     - Padding 11 vertical, with a 0.5px `dividerCard` line between rows.
     - The text-size pref scales these sizes as it does today.
   - Under the name, optionally:
     - **Link chip:** 30px tall, radius 10, `palette.tint`, `actionText` 13/600. Linked recipe: a 22px thumbnail, the name and ›, which navigates. Web link: a link icon in a white 22px tile, the host and ↗, which opens it. Build this as one shared component with two variants.
     - **Allergen badge:** `palette.allergen` / `allergenText`, 12/600, radius 6, padding 3×8: "Gluten · swap X" when a substitute exists, otherwise just the allergen. Tapping keeps the existing tooltip.
   - Per-row add-to-list stays as a trailing icon button (plus → check in `successCheck` when added, animated).
9. **Steps:**
   - `SectionHeader` "Steps" with padding-top 36, then the list with padding 18/20/0.
   - Each step:
     - Timeline column 34px wide, column gap 14. A 34px number circle (`ink` background, white 15/700). A 2px `track` line runs down to the next step, with a 6px margin. The last step has no line.
     - Steps have no titles in our data. The step text (17, line-height 1.5) sits next to the circle, with padding-bottom 28.
   - **Tapping the number marks the step done:**
     - The circle turns `successCheck` with a white check.
     - The text collapses to one line in `textTertiary`.
     - Tapping again reopens it.
     - Animate the transition.
     - Done state is local screen state (not persisted).
   - **Timers:**
     - Keep the inline timer parsing (`StepText`/`helpers`), but render the step's timers as chips in a wrapping row under the text (gap 8).
     - Each chip: 36px tall, radius 14, padding 0 14, 14/600, a `timer` symbol, the tabular time and the label.
     - Colours: idle `tint` with `actionText`; running solid `action` with white; done `successBg` with `success`.
     - Keep today's timer behaviour (start, Live Activity, notifications), only the presentation changes.
     - Remove the timer highlight from the text, or keep it as plain text.
10. **Notes:**
    - `SectionHeader` "Notes" with padding-top 36.
    - A `Card` tone `note` (`palette.note`, radius 20, padding 16, gap 6).
    - Header row: the "Your note" label (13/600, `noteText`) and an "Edit" text action on the right.
    - Body 16 with line-height 1.45.
    - The editing behaviour stays (an inline `TextInput` in the card, same save mutation).
    - Empty note: show a quiet "Add a note" prompt in the same card.
    - Skip "From the recipe", since we have no data for it.
11. **Related recipes:**
    - `SectionHeader` "Related recipes" with padding-top 32, plus a count (14, `textTertiary`) and an "Edit" text action that opens the existing picker sheet.
    - A horizontal row of 140px square `RecipeTile`s (radius 20, title 15/600 on 2 lines, meta 13 "25 min · 600 kcal"), gap 12, padding 0/20/40.
    - Drop the marquee (`MarqueeSync`/`MarqueeText`). Delete those files if nothing else imports them.
    - Section order is the design's: Ingredients → Steps → Notes → Related recipes. Today Related and Notes render before the ingredients, so move them.

## Cleanup
- Remove styles in `RecipeDetailScreen/styles.ts` that become unused. Delete `NutritionBoxGrid`/`TooltipPopover` only if nothing else uses them. Otherwise keep `TooltipPopover`.
- Delete components superseded by primitives (for example `HeaderIconButton` if unused).
- Keep files under ~500 lines and split per the global conventions. `ReadView.tsx` should end up as a thin composition of section components.

## Verification
- Run `pnpm --filter mobile exec tsc --noEmit` (or the repo's mobile typecheck script) and lint.
- Check the locale JSON files for every new key, in all 7 locales.
- Manual: light and dark mode, text-size pref, serves scaling, unit toggle, add to list (row and all), linked recipe chip navigation, timers, step done toggle, notes edit, related picker, tag picker, favourite, delete via the member menu, issue banner, edit-mode entry and exit still working.
