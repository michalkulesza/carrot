# Mobile Recipe Edit redesign

Status: completed

## Goal

Replace the mobile Recipe Details edit mode (`apps/mobile/src/screens/RecipeDetailScreen/EditView.tsx`) with the
"Recipe Edit" design: the read-only Recipe Details layout made editable in place. Simple fields are inline inputs.
Ingredient and step rows open bottom sheets. Tags and related recipes use drawers. Floating native header items show
Cancel, a save-status pill and Save.

Design source: the design artifact's `project/Mobile Screens.dc.html` (section "Recipe Edit", plus "Tags drawer" and
"Related recipes drawer"). This spec carries every value needed, so you don't need the artifact.

## Decisions already made (do not revisit)

- **No step titles and no ingredient notes.** The design shows a "Step title" field and an ingredient
  "Note, e.g. finely grated" field. The data model has neither (steps are `string[]`, ingredients are
  `StructuredIngredient { qty, unit, name }`). Leave both out. No backend or schema changes.
- **Keep "Delete recipe"** as a red text button at the very bottom of the edit page (after Related recipes), edit mode
  only, wired to the existing `onDeleteRecipe`.
- **Group (component) names stay editable** in multi-component recipes, as an inline text field styled like the title
  field, in place of the static group title.
- **Bottom sheets follow `apps/mobile/AGENTS.md`:** `@gorhom/bottom-sheet` `BottomSheetModal`, `enablePanDownToClose`,
  a `BottomSheetBackdrop` that dismisses on tap, the standard handle, `secondarySystemBackground` surface. **No Done /
  close buttons that only dismiss.** The design's "Done" is dropped. Keep "Remove" (a real action).
- **Native header, not custom floating pills.** The read view already uses native header items, which iOS renders as
  Liquid Glass. In edit mode use `navigation.setOptions` (see `useRecipeDetailHeader.tsx`):
  - `headerLeft`: a "Cancel" text button. It calls the existing `handleCancelEdit`, which already handles
    unsaved-change confirmation; keep that.
  - `headerTitle`: the status pill (see Header).
  - `headerRight`: a "Save" button, prominent (action orange), disabled when there are no changes or while saving.

## Layout, top to bottom (edit mode)

Use theme tokens (`palette.*`, `radius.*`, `space.*`, `typography.*`), never hex. Hex values are given only to
identify the token.

### Header
- Status pill (in `headerTitle`): 30pt tall, 12pt horizontal padding, fully rounded, 13/600 text.
  - No changes: "No changes", `palette.placeholder` (#A39A92).
  - Dirty: "● Unsaved changes", `palette.action` (#CF6528).
- Save button background: `palette.action` when dirty, `palette.actionDisabled` (#E8C4AA) when not. White text 16/600.
  Show an `ActivityIndicator` while saving. Guard against double taps (the existing `saving` flag).
- Dirty means the draft differs from the draft the edit session started with (`savedDraftRef` in `useEditDraft.ts`).
  If `useEditDraft` already exposes a dirty check, reuse it. Otherwise add `isDirty`, a memoised deep compare.

### Hero
- Same hero as the read view (`HeroImage.tsx`). Bottom-left overlay "Change photo" button: 16pt from left and bottom,
  40pt tall, 14pt horizontal padding, `radius.control` (14), translucent light surface (reuse whatever glass/blur
  surface the app already uses for overlays), camera icon + "Change photo" 14/600, gap 6.
  Calls `handlePickThumbnail`. Shows a spinner + "Uploading…" while `uploadingThumb`.
- No photo: keep today's tappable "Add photo" placeholder behaviour.

### Title block (padding 24 top, 20 horizontal; vertical gap 16 between blocks)
- Title: multiline `TextInput`, 28/700, lineHeight 31, letterSpacing −0.02em.
  Background `palette.card`, `radius` 10, padding 4×8 with matching negative margin, so the text lines up with read
  mode. Focused: background `palette.popoverSurface` plus a 2pt `palette.action` border.
- Byline under the title (source · avatar · author), exactly as the read view shows it (reuse its component).

### Tags
- Wrapping row, gap 6. Each tag is the read-view tag pill (`palette.tint` bg, `palette.actionText` text, 14/500,
  padding 5×11, radius 14) with a trailing small × that removes the tag.
- A final "+ Tag" pill (`palette.control` bg, `palette.textSecondary` text) opens the **Tags drawer**.
- Keep tag persistence as it works today in `TagsSection.tsx`. Check whether it saves immediately or through the
  draft, and keep that behaviour.

### Stats grid
- One `palette.card` card, `radius.card` (20), padding 12 vertical / 4 horizontal, 5 equal columns: Time (minutes),
  Kcal, Protein, Fat, Carbs. Hairline left divider `palette.dividerStrong` between columns.
- Each column: a numeric `TextInput` (`keyboardType="number-pad"`, digits only), centred, 17/600, background
  `palette.popoverSurface`, radius 10, padding 4×2. Under it the label 13 `palette.textSecondary`, marginTop 2.
  Focused: 2pt `palette.action` border.
- Bound to `draft.totalTimeMinutes / kcal / protein / fat / carbs` via the existing `handleNutritionChange`.
- No AI sparkle markers in edit mode.

### Serves row
- Reuse the read view's serves stepper (`ServesCookRow` / `Stepper`) bound to `draft.servings`, with the minimum and
  maximum it already uses. **No Cook button** in edit mode; the stepper box takes the full width.

### Ingredients
- Section header "Ingredients" as in the read view, without "Add to list".
- One card per component, styled like the read-view `IngredientGroupCard` but **always expanded** (no collapse
  chevron): `palette.card`, radius 20, padding 16 / 16 / 6.
  - Header: group title (inline input for multi-component, see Decisions; static otherwise) and the item count
    (14, `palette.textTertiary`). 1pt `palette.dividerCard` line under it.
  - Rows: 3 columns, gap 12, vertical padding 11, hairline `palette.dividerCard` bottom divider (none on the last row):
    quantity + unit 78pt wide (17/600, lineHeight 23), name (17, lineHeight 23), then an 18pt column with a
    `chevron.right` SF Symbol (`palette.textTertiary`, 4pt top padding). Display quantity and unit with the same
    formatting as the read view (`splitIngredient` + `units.*` translations). The whole row is a `Pressable` that opens
    the **Ingredient sheet** for that ingredient.
  - Footer: "+ Add ingredient", 15/600 `palette.actionText`, padding 12 top / 8 bottom. Appends an empty ingredient
    (existing `addIngredient`) and opens the Ingredient sheet on it.

### Ingredient sheet (BottomSheetModal, dynamic sizing, keyboard-aware)
- Padding 10 top / 20 horizontal, bottom = safe-area inset, vertical gap 14.
- Header row: "Remove" on the left (16/600, `palette.error`); title "Edit ingredient" centred (17/700).
  Remove deletes the ingredient (existing `removeIngredient`, which keeps at least one ingredient per component; hide
  Remove when it's the only one) and closes the sheet.
- Row: Qty input 96pt wide (centred, 17/700, `keyboardType="decimal-pad"`, placeholder "Qty") + Name input (flex,
  17, placeholder "Ingredient"). Inputs are `BottomSheetTextInput`, 50pt tall, radius 14, 1pt `palette.dividerCard`
  border, `palette.popoverSurface` bg, 14pt horizontal padding. Focused: `palette.action` border.
- Unit chips: horizontal `ScrollView`, gap 6. Chip 38pt tall, radius 14, 14pt horizontal padding, 15/600. Selected:
  `palette.action` bg, `palette.onAction` text. Unselected: `palette.control` bg, `palette.ink` text. Options: "none"
  (empty unit) first, then every unit from `UNITS` in `@carrot/shared/types`, labelled via `t('units.<unit>')`.
  This replaces `QuantityUnitPickerModal` for this screen.
- "Shopping aisle": label 13/600 uppercase, letterSpacing 0.5, `palette.textTertiary`; then wrapping chips, gap 6,
  34pt tall, radius 12, 12pt padding, 14/600, same selected/unselected colours. Options: `SHOPPING_CATEGORIES`
  labelled via `t('shoppingList.categories.<c>')`. Bound to the existing `setIngredientCategory`.
- Edits apply to the draft live (no separate confirm). Dismissing the sheet keeps them.
- If the sheet closes with an empty ingredient (no qty, unit or name) that was just added via "+ Add ingredient",
  remove it again, provided the component still has at least one ingredient.

### Steps
- Section header "Steps". In multi-component recipes, group steps under the component name caption exactly like the
  read view's `StepsSection`.
- Each step uses the read-view timeline look (`StepRow`): 34pt `palette.ink` circle with the number (15/700, white),
  a 2pt `palette.track` line down to the next step, body 17 with lineHeight ~25, 28pt bottom padding. Add a pencil
  SF Symbol (`pencil`, 16, `palette.textTertiary`) right-aligned on the circle's row. No timers, no done-toggling in
  edit mode. The whole row opens the **Step sheet**.
- After the last step: "+ Add step" row. A 34pt circle with a 1.5pt dashed `palette.ring` border and a "+" (18,
  `palette.actionText`), then "Add step" 16/600 `palette.actionText`, gap 14. Appends an empty step (existing
  `addStep`) and opens the Step sheet on it. One per component.

### Step sheet (BottomSheetModal)
- Same shell and header as the Ingredient sheet, title "Edit step". Remove uses the existing `removeStep`, keeps at
  least one step, and is hidden when it's the only step.
- One multiline `BottomSheetTextInput`: 17, lineHeight 25, padding 12×14, minimum height ~6 lines, same border and
  focus rules as above. Bound to `setStep`.
- An empty step that was just added and closed empty is removed again (same rule as ingredients).

### Notes
- Reuse `NotesSection` as it already works. Check that it matches: card `palette.note` (#FFF7E8), radius 20,
  padding 16, gap 6; label "Your note" 13/600 `palette.noteText`; text 16 with lineHeight 23; in edit mode the input
  has a `palette.popoverSurface` background with radius 10. Adjust styles only if they differ; don't change how notes
  save.

### Related recipes
- Reuse `RelatedRecipesSection`. In edit mode:
  - The section header action reads "+ Link" and opens the related-recipes drawer.
  - Each 140pt tile gets a 28pt round remove button top-right (8pt inset, light translucent bg, `xmark` 12,
    `palette.bodyOnCard`).
  - A trailing dashed tile (140×140, radius 20, 1.5pt dashed `palette.dividerStrong`) with "+" (24) and
    "Link recipe" (15/600, `palette.actionText`) opens the drawer.
- Keep how links are persisted today.

### Delete recipe
- Red text button at the bottom: `trash` icon + "Delete recipe", `palette.error`, centred, 44pt min height, 32pt top
  margin. Calls `onDeleteRecipe`; disabled while saving.

## Drawers (restyle the existing ones to match)

Both are `BottomSheetModal` at ~90% height, following AGENTS.md (no Done button).

### Tags drawer (`TagPickerModal` in `components/RecipeFieldEditors.tsx`)
- Header (hairline `palette.dividerCard` bottom border, padding 10/20/12, gap 14): a 3-column row with the selected
  count on the left (14, `palette.textTertiary`, e.g. "3 selected") and "Edit tags" centred (17/700); the right column
  stays empty.
- Search field: 44pt, radius 14, `palette.control` bg, magnifier icon, placeholder "Search or create a tag", clear (×)
  button when there's a query.
- Selected chips: horizontal scroll, `palette.tint` chips with a trailing ×; tapping one removes it.
- List: a "Create tag "<query>"" row when the query matches no tag. That row is 52pt, `palette.tint` bg, radius 14,
  with a 26pt `palette.action` "+" circle and text in `palette.noteText`, the query in bold. Then tag groups: an
  uppercase 13/600 `palette.textTertiary` heading, then 50pt rows with a hairline divider, label 17 (600 when
  selected), and a 26pt circular check on the right (use the existing `Checkbox`/`CheckboxIcon` visual).
- Empty: "No matching tags", centred, 15 `palette.textTertiary`.
- Keep the existing tag create/assign logic. Only the presentation changes.

### Related recipes drawer (the picker inside `RelatedRecipesSection.tsx`)
- Same header pattern: count on the left, "Related recipes" centred. Search: "Search your recipes".
- Selected chips with a 24pt thumbnail (radius 8) + short title + ×.
- Rows: 68pt min height, 52pt thumbnail (radius 12), title 16 (600 when selected, single line), meta 13
  `palette.textTertiary` (time · kcal, as recipe rows show elsewhere), 26pt circular check on the right.
- Empty: "No recipes match".
- Keep the existing selection and persistence logic.

## Cleanup
- Remove the old bottom action bar (Cancel/Save), the `NutritionBoxGrid editing` usage, the per-row `IngredientEditor`
  usage and the `QuantityUnitPickerModal` usage from the edit view. Delete any component, style key, hook state
  (`qtyUnitPickerTarget`, `currentQty`, `currentUnit`, `handleQtyUnitChange`, …) or translation key that becomes
  unused **across the whole repo** (grep `apps/web`, `apps/mobile` and `packages` before deleting anything shared).
- `EditView.tsx` will grow past a readable size: split it per the conventions. New components (e.g.
  `EditTitleBlock`, `EditStatsGrid`, `EditIngredientGroupCard`, `EditStepsSection`, `IngredientEditSheet`,
  `StepEditSheet`, `ChangePhotoButton`) each get their own file directly under `RecipeDetailScreen/`. Styles go in the
  shared `RecipeDetailScreen/styles.ts`; pure helpers go in `helpers.ts`.

## Translations
- Every visible string goes through `t()`. Reuse existing keys where they exist (`common.cancel`, `common.save`,
  `common.changePhoto`, `common.uploading`, `addRecipe.addIngredient`, `addRecipe.addStep`, `recipes.deleteRecipe`,
  `tags.editTags`, `settings.nameLabel`, …). Check first.
- Add new keys to **all 7** locale files in `packages/shared/src/locales/` (en, pl, de, fr, es, it, pt), in their
  existing sections, with real translations. Likely new: status "No changes" / "Unsaved changes", "Edit ingredient",
  "Edit step", "Remove", "Qty" placeholder, "Ingredient" placeholder, "Shopping aisle", "+ Tag", "+ Link",
  "Link recipe", "Search or create a tag", "Create tag \"{{name}}\"", "No matching tags", "{{count}} selected",
  "Search your recipes", "No recipes match", "No unit".

## Conventions (must follow)
- Global `~/.claude/CLAUDE.md` conventions: const arrow components, `useCallback` handlers, no inline multi-line
  callbacks or JSX ternaries in props, named consts for non-trivial expressions, blank lines between steps, zero
  comments unless the why is non-obvious, files under ~500 lines.
- Colours only from `palette` / `PlatformColor`. Font sizes as given. Spacing in multiples of 4 where the design
  allows.
- `Pressable` with `hitSlop` for small targets (44pt minimum). Light haptic on chip and stepper taps. Accessibility
  labels on every interactive element. Correct `keyboardType`, `returnKeyType`, `autoCapitalize` and `autoCorrect` on
  every input.
- Repeated taps must be safe (Save, Remove, Add ingredient/step, opening sheets).
- Behaviour that must keep working: the edit lock (`useRecipeEditLock`), unsaved-changes confirmation on Cancel,
  save conflict handling in `useEditDraft`, the thumbnail upload flow, `autoEditParam`.

## Verification
- `cd apps/mobile && npx tsc --noEmit -p .` passes.
- If `packages/shared` changed: `cd apps/web && npx tsc --noEmit -p .` passes.
- Don't commit. Report changed files, anything not implemented, and any judgement calls.
