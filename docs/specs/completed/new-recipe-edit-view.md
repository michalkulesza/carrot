# Write-from-scratch uses the recipe edit view (mobile)

## Goal
Add menu → "Write from scratch" (`useAddMenu.writeFromScratch` → `router.push('/new-recipe')`) currently opens the old
`apps/mobile/src/screens/NewRecipeScreen` form (`RecipeFormView` + bottom `ActionBar`). Replace it with the new recipe
detail edit UI (`RecipeDetailScreen/EditView`), visually identical to editing an existing recipe, just empty.

## Behaviour
- Route stays `/new-recipe` (`app/new-recipe.tsx`), screen opens directly in edit mode with an empty draft:
  empty title, empty stats, servings empty, one component (name `''`) with one blank ingredient and one blank step,
  `shopping_list_categories: ['other']`, `step_ingredient_line/component: null`.
- Header: same native items as edit mode in `useRecipeDetailHeader` (Cancel left, prominent Save right,
  `EditHeaderTitle`, `gestureEnabled: false`, transparent). Save disabled while saving or until the title is non-blank.
  Cancel: if draft is untouched → `router.back()`; otherwise the existing discard alert
  (`addRecipe.discardChangesTitle` / `discardChangesMessage` / `addRecipe.discard`).
- Hero: `EditHero` photo picker. Upload uses `uploadThumbnailImage(makeTempRecipeId(), asset)` (temp id generated once per
  screen, like the old flow).
- Title, stats grid, servings, ingredients (sheet), steps (sheet): identical to edit, driven by the same draft mutators.
- Tags, notes, related recipes: shown and editable, but held **locally** (no recipe exists yet), then persisted on save:
  - tags → `tag_ids` in the create payload
  - notes → `notes` in the create payload
  - related recipes → after create, `api.setRelatedRecipes(newId, ids)` if any were picked (failure: alert
    `addRecipe.saveError`, recipe stays created)
- Hidden in new mode: Byline (no source/creator/households yet) and the footer `DeleteRecipeButton`.
- Save: `api.saveRecipe(payload)`; payload built by a new pure `buildNewRecipeSaveRequest(draft, { tagIds, notes })` in
  `RecipeDetailScreen/helpers.ts` (drop blank ingredients/steps exactly like `buildEditRecipeSaveRequest`; metric/imperial
  variants `null`, `ingredient_flags: []`, `source_url`/`creator_handle` `null`). On success: insert into the `['recipes']`
  cache (or invalidate), invalidate `['allergen-recheck-status']`, success haptic, then
  `router.replace('/recipe/<newId>')` so the user lands on the read view of the new recipe.
  On error: error haptic + `Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))`.
- Repeat-tap safety: a ref guard so Save can't fire twice (saving state also disables the button).

## Implementation notes
- Reuse, don't fork. Extract the draft mutators (updateComp, setIngredient, setIngredientCategory, add/remove ingredient,
  setStep, add/remove step, nutrition, servings) out of `useEditDraft` into a shared hook (e.g. `useDraftMutators(setDraft)`)
  used by both `useEditDraft` and the new screen's hook. Add a `buildEmptyDraft()` helper next to `buildDraft`.
- Make `EditView` work without a `RecipeOut`: e.g. a `mode: 'edit' | 'new'` (or optional `recipe`) plus controlled props for
  the local tags/notes/related state in new mode. `TagsSection`, `NotesSection`, `RelatedRecipesSection` currently persist
  directly against a recipe id. Give each a controlled/local variant (value + onChange) rather than duplicating their UI;
  keep the existing persisted behaviour for edit mode unchanged.
- Header: either generalise `useRecipeDetailHeader`'s edit branch into a reusable helper or a small `useNewRecipeHeader`
  that builds the same items. Don't duplicate `EditHeaderTitle`.
- New screen lives at `src/screens/NewRecipeScreen/index.tsx` (+ `useNewRecipeDraft.ts` if needed); delete the old
  `RecipeFormView`, `ActionBar`, `RecipeHeroImage`, old `helpers.ts`/`styles.ts`/`useNewRecipeHeader.tsx` if unused afterwards.
  Remove any now-unused translation keys only if nothing else (web/shared) uses them.
- Follow repo conventions (global + project CLAUDE.md, `apps/mobile/AGENTS.md`). Any new strings → all 7 locales.

## Verification
- `pnpm --filter mobile exec tsc --noEmit` (or the repo's mobile typecheck script) passes; mobile lint passes.
- Edit of an existing recipe behaves exactly as before (tags/notes/related persist immediately).
