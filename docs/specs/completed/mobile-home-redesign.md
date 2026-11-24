# Mobile Home redesign (Claude Design → Expo)

## Context
Claude Design project `Mobile Screens.dc.html` (Home section: default, "nothing planned", imports-expanded, Add menu open) is now the source of truth, and `apps/mobile/DESIGN.md` specifies the tokens and components. This pass covers **Home only**. The design's bottom bar is a placeholder: we keep the existing `NativeTabs` from `app/(tabs)/_layout.tsx`, which already matches it (Home, Meal Plan, Shopping, Settings + search role). The goal is a tokenised, reusable component layer (colours, spacing, radii, type, buttons, cards, thumbnails, tiles, progress) that the following screens (Browse, Recipe Details) will reuse, with animations on open/expand/add/remove.

Decisions from the Q&A:
- **Colours:** one tokens file. Light values come from DESIGN.md hex, dark values are warm counterparts I derive. Exposed through `DynamicColorIOS`, so dark mode stays automatic. Native chrome keeps system colours.
- **Jump back in:** tracked locally in AsyncStorage (cook session + last viewed recipe).
- **Update (user decision):** the Add button now opens a custom popover (`HomeScreen/AddMenuPopover`) instead of the native menu described below; the clipboard row is detected with `hasUrlAsync()` and read only on Import tap. iOS has no permanent clipboard permission; users can set Settings > Carrot > Paste from Other Apps > Allow.
- **Add (original plan, superseded):** the design's updated "Add recipe" section has an orange round + in the header, which opens a **native UIMenu** (`@react-native-menu/menu`) instead of the custom popover. The **AddRecipeDrawer stays**, restyled to the design's "Import from link" and "Paste text" sheets (plus the personal library sheet). `FloatingAddButton` is removed.
- **Import progress:** an indeterminate animated bar while the job is pending or running. No backend change.

## Step 0
Copy this plan to `docs/specs/mobile-home-redesign.md`, include it in the commit, and move it to `docs/specs/completed/` when done.

## 1. Design tokens — `apps/mobile/src/theme/`
- `colors.ts`: extend it, don't replace it, because existing screens use it. Add a `palette` of DESIGN.md roles built with a `dynamic(light, dark)` helper wrapping `DynamicColorIOS`, with hex on Android.
  - Roles: `ink`, `textSecondary`, `textTertiary`, `placeholder`, `bodyOnCard`, `background`, `card`, `control`, `dividerCard`, `track`, `dividerStrong`, `action`, `actionText`, `tint`, `tintText`, `note`/`noteText`, `allergen`/`allergenText`, `error`/`errorBg`, `success`/`successBg`/`successCheck`, `avatarHousehold`, `onImage` (white).
  - Dark values are warm: bg `#14110E`, surface `#26211C`, control `#332C26`, text `#F3EEE6`, action `#E8894A` (this follows DESIGN.md's dark cook mode palette).
- `spacing.ts`: `space = {xs:4, sm:8, md:12, lg:16, xl:20, xxl:32}`, plus `screenGutter = 20` and `sectionGap = 28`.
- `radius.ts`: `{ input:10, control:14, card:20, sheet:28, round:999 }`.
- `typography.ts`: DESIGN.md text styles as `StyleSheet` entries: `screenTitle`, `recipeTitle`, `sectionHeading`, `groupTitle`, `bodyLarge`, `body`, `meta`, `caption`, `kicker`, `tileTitle`, `tileMeta`, and `tabularNums` (`fontVariant`).
  - DESIGN.md's 14/15/19pt sizes go outside the global HIG scale. DESIGN.md is the project spec, so it wins here, kept in this one file.
- `motion.ts`: shared Reanimated presets.
  - `enterFade = FadeInDown.duration(250)`, `exitFade = FadeOut.duration(160)`, `layout = LinearTransition.duration(200)` (no spring), `pressScale` constants.
  - A `useMotion()` hook returns `undefined` animations when `useReducedMotion()` is on. This reuses the ShoppingList pattern.

## 2. Reusable UI primitives — `apps/mobile/src/components/ui/` (one file each, variants via props)
- `AppText.tsx`: `<AppText variant="kicker" tone="actionText" numberOfLines>`. Typography and colour come only from tokens.
- `Button.tsx`
  - `variant`: `primary | secondary | destructive | text | onImage`
  - `size`: `sm` (34) | `md` (38) | `lg` (44) | `xl` (54)
  - Other props: `icon` (SF Symbol via `expo-symbols`), `fullWidth`, `loading`, `accessibilityLabel`
  - Pressable with `hitSlop`, an animated press scale, and a light haptic.
  - Built-in double-tap guard: it ignores presses while an `onPress` promise is pending.
- `Card.tsx`: `tone: default | note | error | attention | plain`, `padding` token, radius `card`, optional `onPress` with press animation.
- `CardRowList.tsx`: rows inside a card with 0.5px `dividerCard` separators, `Animated.View` + `layout` transition. Rows can enter and exit with animation.
- `Thumbnail.tsx`: wraps the existing `ThumbnailImage`/expo-image.
  - `size` presets: `xs52 | sm60 | tile148 | row88 | custom`; `radius` token.
  - Optional `glyph` fallback (icon and tone) for import placeholders.
  - Shows the existing `ImageShimmer` while loading.
- `ProgressBar.tsx`: `value?: number`; indeterminate when undefined, as a looping Reanimated translateX. 4px tall, `track`/`action` colours.
- `SectionHeader.tsx`: title (`sectionHeading`) plus an optional action (`text` Button, e.g. "See all"). Padding 28/20/12.
- `RecipeTile.tsx`: square photo (default 148), 2-line title, meta. Press scale. It replaces `HomeRecipeCard` and is reusable for the Browse grid later.
- `IconCircle.tsx`: fully round count/icon badge (36px count in the Imports row).
- `Expandable.tsx`: header row with a rotating chevron (`withTiming`) and a body that is always mounted and measured. Opening and closing animate its height and opacity with `expandTiming` (260ms ease-out, no spring), so the content below slides smoothly. Under reduced motion it changes instantly.

## 3. Home screen — `apps/mobile/src/screens/HomeScreen/`
Keep the existing `ScrollView` (`contentInsetAdjustmentBehavior="automatic"`), 20px gutter, Sections fade in with `enterFade` only. No layout transitions on sections: content below moves instantly when a card expands, appears or disappears.

- **Header** (`useHomeHeader.tsx`)
  - `headerLeft`: the existing `HouseholdHeaderTitle` (avatar + caret switcher) with the "Home" title in `screenTitle` style.
  - `unstable_headerRightItems`: a native `UIBarButtonItem` (`type: 'menu'`, `variant: 'prominent'`, `tintColor: palette.action`, SF `plus`) whose native menu items come from `useAddMenuItems.ts`; the clipboard item refreshes on mount, app foreground and screen focus. This is the design's updated "Add recipe" section.
  - Native UIMenu items, matching the design's list. UIMenu can't render the design's custom banner or footer, so:
    - **Clipboard link** (shown first, only when the clipboard holds an http URL): one item, "Import link from clipboard", with the host as its subtitle. Tapping it enqueues straight away (one tap, as the design says). The clipboard is checked with `Clipboard.hasUrlAsync()` when the menu opens, so no paste prompt appears until the user picks the item.
    - **Import from link** ("Instagram, TikTok or any recipe site"): opens the drawer on the `link` sheet.
    - **Take photo** ("Cookbook page or handwritten card"): camera → enqueue.
    - **From photos** ("Screenshots and saved images"): library → enqueue.
    - **Paste text** ("Any recipe text"): opens the drawer on the `text` sheet.
    - **From personal library**: an existing feature that isn't in the design. It stays as a conditional item (in a household with personal recipes) and opens the `personal-library` sheet.
    - **Write from scratch** ("Opens an empty recipe in edit"): `/new-recipe`.
    - The design's share-sheet tip becomes the menu `title`.
  - Delete `FloatingAddButton.tsx`.
- **AddRecipeDrawer refactor + restyle** (`src/components/AddRecipeDrawer/`). The drawer stays, now only for the "short sheets":
  - Move the enqueue, camera, gallery and clipboard logic out of `index.tsx` into `useAddRecipeActions.ts`. Both the drawer and `AddMenuButton` call it, so nothing is duplicated.
  - Change the handle to `present(sheet: 'link' | 'text' | 'personal-library', opts?: { url?: string })`. Remove the `picker` subview, `MethodPickerView` and `QuickUrlInputRow` (the menu replaces them).
  - **Sheet chrome**, following DESIGN.md sheets:
    - `background` surface, 28px top radius, a 40×5 `dividerStrong` grabber, and the dimmed backdrop (tap or pull to close).
    - A centred 17/700 title. The design's "‹ Add" back link is dropped, because the menu is native and can't be returned to, and AGENTS.md bans close-only buttons.
  - **`LinkSheet.tsx`**
    - A 44px URL input (1px `dividerCard` border, 14 radius; the border turns `action` on focus, no halo) next to a secondary `lg` "Paste" `Button` of the same height.
    - Once the URL parses, a source preview `Card` appears with an animated `enterFade`: link icon tile, a source name ("Instagram reel", "TikTok video", "YouTube video", or the host) and "We'll pull the title, photo, ingredients and steps".
    - A primary `xl` Import button, using the `actionDisabled` token (`#E8C4AA`) when there's no valid URL.
    - Footnote: "Imports keep going in the background — you'll see progress on Home."
    - Unsupported URLs keep the existing "open in browser" → `/webview-import` path.
  - **`TextSheet.tsx`** (restyles `TextPasteView`)
    - A multiline input filling the sheet, on `card` with 20 radius. On focus it switches to `background` with a 1px orange border (no halo).
    - Below it, a right-aligned secondary `lg` "Paste" button, the same as the link sheet's. There is no line-count hint.
    - A primary `xl` Import button (disabled tint when empty).
  - `PersonalRecipePickerView` is restyled with the same chrome and tokens.
  - One 560pt snap point for all three sheets, so link and text open at the same size, with keyboard-aware behaviour kept. Both inputs use `typography.body` (16/21).
  - Routing:
    - `openAddRecipe=1` (share sheet, Browse) and incoming http links open the `link` sheet, prefilled when there's a URL.
    - `useOpenAndPaste` opens the `text` sheet.
  - Add the token `actionDisabled` and an `IconButton` primitive (round, `size` 40/44, `variant` primary/control/glass), reusable for the sort button and the recipe hero.
- **TonightCard.tsx**: replaces `NextMealCard`, with the same `useNextMealPlanEntry` data.
  - **Entry with recipe**: a 150px photo card, `expo-linear-gradient` overlay, kicker `TONIGHT · 25 MIN` (or `TOMORROW`/the weekday when the next entry isn't today; there's no meal-type field), title, and a white `onImage` Open button with no icon. The button and the card both open the recipe (not cook mode).
  - **Text-only entry**: the same card without a photo, on `card`.
  - **Empty** (`TonightEmptyCard`): icon tile, "TONIGHT" kicker, "Nothing planned yet", and two buttons: primary "Plan tonight" (switches to the Meal Plan tab with `planToday`, which scrolls to today and opens the shared `RecipePicker` for today) and secondary "Open meal plan".
  - Keep the skeleton and error states. Crossfade between states with `enterFade`.
- **ImportsCard.tsx** (replaces `ImportJobsSection`; data from `useImportJobs`): an `Expandable` card.
  - **Header**: `IconCircle` with the count, "Imports", and a summary ("1 in progress · 2 need you" / "All done") in a pluralised i18n string.
  - **Body**: a `CardRowList` of `ImportRow.tsx`. Rows animate in and out as jobs arrive, get dismissed or succeed.
  - **ImportRow**:
    - Thumbnail glyph by status: ↓ tint while running, ! error, ✓ success; a duplicate shows the existing recipe's thumbnail.
    - Title in error colour on failure, and the source host.
    - `ProgressBar` (indeterminate) while pending or running.
    - No action buttons: a failure or duplicate shows a 28px `!` badge (`IconCircle` tone `error` / `attention`); tapping the row opens its action sheet (Retry, Import anyway, Go to recipe…).
    - Long-press keeps the existing ActionSheetIOS secondary actions (import anyway, cancel, dismiss, continue manually) by reusing logic moved out of `PendingJobCard.tsx` into `useImportJobActions.ts`. `PendingJobCard` is then deleted.
  - Hidden when there are no jobs. It auto-expands once when a job needs attention.
- **JumpBackInCard.tsx**: a `SectionHeader` plus a `CardRowList` of up to 2 rows.
  - **Cook session**: 60px thumbnail, kicker "COOK MODE", title, `ProgressBar value=step/total`, and a primary "Resume" button with a play icon. Opens the recipe with `cookMode=1&stepIndex`.
  - **Last viewed**: "LAST VIEWED", title, and "Open".
  - Rows resolve the recipe from the `useRecipes` cache and are hidden if the recipe has been deleted. The whole section is hidden when there are no rows.
- **Shelves**: `RecipeShelf.tsx` keeps a horizontal `FlatList` and uses `SectionHeader` + `RecipeTile` (148px, 20px radius, 12px gap). The shelf fades in with `enterFade`. It has no item layout animation.
- **Empty library state** (no recipes, no imports): a `Card` with an icon, title and primary "Add a recipe" button, which opens the drawer.
- Move the screen's `StyleSheet` into the shared `styles.ts` using tokens only. Delete styles and helpers that are no longer used (`HomeRecipeCard`, `NextMealCard`, `ImportJobsSection`, `FloatingAddButton`, `PendingJobCard`).

## 4. Recent activity store (Jump back in data)
- `apps/mobile/src/storage/recentActivity.ts`: one AsyncStorage key, `recent-activity:v1`, holding
  `{ cook?: {recipeId, stepIndex, totalSteps, updatedAt}, lastViewed?: {recipeId, viewedAt} }`.
  Typed read/write helpers that never throw (wrapped in try/catch).
- `src/hooks/useRecentActivity.ts`: `useQuery(['recentActivity'], read)` plus `useMutation` setters that write and update the query data.
- Writers:
  - `RecipeDetailScreen/CookMode.tsx` updates `cook` on step change (next to its existing `cook-mode:${id}` write) and clears it on finish or exit at the last step.
  - `RecipeDetailScreen/index.tsx` sets `lastViewed` on mount.
- When the same recipe is both the cook session and the last-viewed recipe, it is shown only as the cook row.

## 5. i18n
New keys go in all 7 locales (`packages/shared/src/locales/{en,pl,de,fr,es,it,pt}.json`):
- `home.tonight`, `home.tomorrow`, `home.nothingPlanned`, `home.planTonight`, `home.openMealPlan`, `home.add`
- `home.imports.title`, `home.imports.inProgress_one/_other`, `home.imports.needYou_one/_other`, `home.imports.allDone`, `home.imports.review`, `home.imports.retry`, `home.imports.importing`, `home.imports.alreadyInLibrary`
- `home.jumpBackIn`, `home.cookModeKicker`, `home.lastViewed`, `home.resume`, `home.open`
- `addMenu.*` titles and subtitles, `addMenu.clipboardLink`, `addMenu.tip`
- `addRecipe.importFromLink`, `addRecipe.urlPlaceholder`, `addRecipe.sourcePreview`, `addRecipe.backgroundHint`, `addRecipe.textPlaceholder`, `addRecipe.source.instagram|tiktok|youtube`

Reuse the existing keys (`home.recentlyAdded`, `home.seeAll`, `importJobs.failure.*`, `addRecipe.*`) where they fit, and remove keys that are no longer used.

## 6. Quality rules applied throughout
- Every button is double-tap safe (Button guard plus the existing optimistic mutations).
- Haptics: light on taps, success on import enqueue.
- Accessibility labels on every pressable. Minimum 44pt targets through `hitSlop`.
- Memoised derived lists and `useCallback` handlers. `React.memo` on `RecipeTile`/`ImportRow`.
- Reduced motion respected through `useMotion()`.
- No hardcoded colours or sizes outside `src/theme/`.
- Screen files under ~500 lines.

## Execution (subagents)
1. Sonnet: tokens + `ui/` primitives (sections 1–2). Then I review.
2. Sonnet: recent activity store + CookMode and detail writers (section 4). Runs in parallel with 1.
3. Sonnet: AddRecipeDrawer refactor + AddMenuButton + header.
4. Sonnet: Home sections (section 3) on top of 1–3.
5. Haiku: i18n keys across the 7 locales.

## Verification
- `cd apps/mobile && npx tsc --noEmit`; `pnpm --filter @carrot/shared typecheck`.
- `pnpm be+ios`, then check on the simulator:
  - Tonight with a photo, text-only, and empty states.
  - Imports: enqueue a link to see the running bar, a failing URL and a duplicate (both show the `!` badge; tap the row for Retry / Go to recipe).
  - Expand and collapse animations.
  - Jump back in after leaving cook mode mid-way and after viewing a recipe.
  - Every Add menu item: the clipboard link item appears only when a link is on the clipboard; import from link with valid, invalid and unsupported URLs; camera, photos, paste text, library, scratch.
  - Both sheets' disabled and enabled Import states and the source preview animation.
  - Share sheet → drawer still opens.
  - Favourite toggling animates the shelf.
  - Dark mode, Reduced Motion, and Dynamic Type.
- Confirm with the user before committing.
