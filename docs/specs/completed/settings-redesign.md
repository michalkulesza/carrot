# Settings redesign (mobile)

Status: completed

Bring the mobile Settings tab and its subpages in line with the picked design. The design source is the "Mobile - Settings" canvas (artifact `QoRQGAvyX7tzj94kmzCZ1a`); reference renders and HTML fragments for each picked artboard are in [settings-redesign/](settings-redesign/):

| Screen | Render | HTML fragment |
|---|---|---|
| Settings main (A3.9, soft peach header) | `set-k11.png` | `set-k11.html` |
| Allergies & intolerances (B, chips + summary) | `alg-b.png` | `alg-b.html` |
| Household (B, invite first) | `hh-b.png` | `hh-b.html` |
| Shopping categories (A, toggles + reorder) | `cat-a.png` | `cat-a.html` |
| My recipes (A, list) | `rec-a.png` | `rec-a.html` |
| Report an issue (C, page, text only) | `rep-c.png` | `rep-c.html` |

The HTML fragments are static exports. `<sc-if>` blocks are conditional states, so the renders show some states side by side (e.g. Household shows both the code row and the email row; Report shows both the form and the thanks state).

Follow `apps/mobile/DESIGN.md`, `apps/mobile/AGENTS.md`, the global conventions in `~/.claude/CLAUDE.md`, and the repo `CLAUDE.md`.

## Decisions (already made by the user)

- **Navigation:** the tab bar in the mockups is a placeholder. Keep the existing `NativeTabs` in `app/(tabs)/_layout.tsx` unchanged.
- **Headers:** keep native stack headers. Main Settings keeps its native header title. Subpages use the standard transparent back control (per AGENTS.md), **not** the mockup's 40px round back button. Don't build the inline custom title row.
- **Report an issue:** keep the existing Sentry `captureFeedback` flow in `app/bug-report.tsx`. Restyle it to design C and add the in-place "Thanks, we got it" success state with a "Back to settings" button. No backend work.
- **Shopping categories:** build toggles + drag reorder + locked "Other" row. **Do not** build "+ Add category" (categories are a fixed backend enum). That is logged in `docs/TODO.md`.
- **Delivery:** implement everything in one pass. The user reviews once at the end.

## Hard rules

- **No behaviour loss.** Every option on today's Settings screen must still exist after the redesign: invitations, household switch/new/join, units, language, week start, appearance, keep-screen-on (recipes + shopping list), show completed items, shopping categories, allergens + recheck status, privacy policy, report issue, my recipes, log out, delete account (with its email-typing confirmation). Audit `src/screens/SettingsScreen/index.tsx` and its sections before deleting anything.
- **Colors only from `palette` / `colors` in `src/theme`.** No hex literals in components. If a design color is missing from `paletteTones`, add a light/dark pair there (e.g. the peach profile card `#F3CBA9` → `profileCard`, the invite card tint, the household notice yellow already exists as `allergen`/`allergenText`).
- **Spacing/radius/typography only from theme tokens** (`space`, `screenGutter`, `sectionGap`, `radius`, `typography`). Add a token rather than inline a number when a value repeats.
- **Every string through `t()`**, with new keys added to all 7 locales (`packages/shared/src/locales/{en,pl,de,fr,es,it,pt}.json`). Reuse existing keys where the meaning matches.
- **Repeat-tap safe:** every mutation (switch household, join, invite, send email invite, promote/remove member, leave, toggle category, report send, log out, delete) is guarded against double taps (pending state / disabled button / in-flight ref).
- **React Query** for all data (existing shared hooks in `@carrot/shared/hooks/*`).
- **Native-first:** `Switch`, `ActionSheetIOS`, `Alert.alert`, `ActivityIndicator`, native header. Use `ActionSheetIOS` for Language, Week start and member options, as today.
- Respect `useReducedMotion` via the existing `useMotion()` helper for all animations.
- Files over ~500 lines get split per the file-organization conventions. `SettingsScreen/index.tsx` is already 611 lines and must end well under that.

## Shared components: reuse and add variants

Extend `src/components/ui` instead of building one-off views inside screen folders. Prefer adding a `variant`/`tone`/`size` prop to an existing component over a new component. Expected work:

1. **`SettingsGroup` + `SettingsRow`** (new, in `src/components/ui/`). A grouped card (`Card` tone `default`, radius `card`, padding per design) holding rows separated by a hairline inset divider (`dividerCard`). `SettingsRow` props cover every row type in the designs:
   - `icon` (plain grey 20px Feather/SF-style glyph, design A3.2 "plain icons"; colour `textSecondary`)
   - `leading` (custom node, e.g. household `Avatar`, drag handle, lock)
   - `title`, optional `subtitle`
   - `value` (right-aligned secondary text, e.g. "6", "English", "1 avoided")
   - `accessory`: `'chevron' | 'switch' | 'none' | ReactNode` (switch takes `value`/`onValueChange`; ReactNode for segmented controls, "Manage"/"Switch"/"Edit" buttons)
   - `tone`: `'default' | 'destructive'` (Log out / Delete account / Leave household in `error` colour)
   - `onPress` with press feedback via `usePressScale` + `lightHaptic`, min 44pt height, `accessibilityRole="button"`.
   Use it for every grouped list on the main screen, Household members, Shopping categories and Help/Danger zones.
2. **`SectionHeader`**: reuse `src/components/ui/SectionHeader.tsx` (caption style: "HOUSEHOLD", "KITCHEN", …). Delete the local `SettingsScreen/SectionHeader.tsx` duplicate.
3. **`Button`**: confirm it has variants for primary (orange, "My recipes", "Share", "Send"), secondary (`control` bg, "Back to settings", "Send" disabled look), and a **new `surface` variant** (white/`background` fill on a card: "Manage", "+ New household", "Join with code", "Edit"). Add a `size` (`sm`/`md`/`lg`) if missing, and an optional leading icon.
4. **`SegmentedControl`**: reuse for Units (Metric/US), Look (Light/Dark/Auto) and the Household invite tabs (Link or code / Email). Add a compact size if the in-row version needs it.
5. **`Pill`**: add a `selectable` variant for allergen/intolerance chips (unselected: `control` bg; selected: `action` bg + `onAction` text, or `tint` + `tintText`. Match the design and keep contrast WCAG AA). Animate selection colour change.
6. **`Avatar`** (`src/components/Avatar.tsx`): supports initials + colour at the sizes used here (profile 48, household row 36, member 40, recipe placeholder thumbnails). Add a `shape: 'circle' | 'rounded'` variant for the rounded-square household badges ("LI", "PA").
7. **Stat tile**: the three white boxes in the profile card. Check `MacroStrip`/`NutritionBoxGrid` first. If neither fits, add `StatTile` to `ui/` and replace `SettingsScreen/StatsSection` with it. Numbers use `RollingNumber` or tabular nums.
8. **Search field**: My recipes uses the standard search field (44px, `control` bg, radius `control`). Reuse an existing one if present (check SelectionDrawer / Browse). Otherwise add `ui/SearchField.tsx`.
9. **`RecipeRow`**: reuse for My recipes rows (thumbnail or initials placeholder, title, "10 min · Sauce", chevron). Add a `compact` variant if needed rather than a new row.
10. **Notice banner**: the yellow "Applies to everyone in Limburger…" info card. Add a `tone` (`info`/`attention`) on `Card` or a small `Notice` in `ui/` (icon + rich text), using `allergen`/`allergenText` colours.

Remove every component, style key and helper the redesign makes unused (e.g. old `styles.ts` keys, `PrimaryButton` usage in bug-report if `Button` replaces it, local `SectionHeader`).

## Screens

### 1. Settings main (`src/screens/SettingsScreen/`)

Order (top to bottom), `screenGutter` side margins, `sectionGap` between groups:

1. **Profile card**: peach card (`profileCard` token, radius `card`). Orange `Avatar` (initials), name (`cardTitle`) + email (`meta`, `textSecondary`). Below it, a row of 3 stat tiles (Recipes, Ingredients, Avg kcal, numbers in `actionText`) and a full-width primary "My recipes" button with a book icon → `/(tabs)/settings/my-recipes`.
2. **Invitations**: keep the existing `InvitationsSection` when there are pending invites, restyled with `SettingsGroup`. Rows animate in/out (`rowEntering`/`rowExiting`/`rowLayout`) when accepted/declined.
3. **HOUSEHOLD**: one row per household with rounded `Avatar` in household colour. The active row shows "Current · N people" and a surface "Manage" button → `household/[id]`. Other rows show a "Switch" text action. A footer inside the card holds two surface buttons: "+ New household" and "Join with code" (existing Alert.prompt flows). Switching re-orders with `rowLayout`. Rows added/removed (new household, join, leave) animate.
4. **KITCHEN**: "Shopping categories" (cart icon, value = number of enabled categories, chevron) and "Allergies & intolerances" (shield icon, value = "N avoided" / none, chevron → new allergies route).
5. **PREFERENCES**: Units (segmented Metric/US), Language (value + chevron → ActionSheet), Week starts on (value + chevron → ActionSheet), Look (segmented Light/Dark/Auto, bound to `useAppearanceMode`).
6. **KEEP SCREEN ON**: "In recipes" switch, "On the shopping list" switch.
7. **SHOPPING LIST**: "Show completed items" switch with subtitle "Keep ticked items in their aisle".
8. **HELP**: Report an issue (chevron → `/bug-report`), Privacy policy (chevron → existing URL).
9. **DANGER ZONE**: Log out (icon, destructive tone, Alert confirm), Delete account (destructive tone, existing two-step confirm).

The allergen editor and recheck status move off this screen onto the Allergies page.

### 2. Allergies & intolerances (new route `app/(tabs)/settings/allergies.tsx` → `src/screens/AllergiesScreen/`)

- Native header title "Allergies".
- Notice banner: "Applies to everyone in **{household}**. Allergen flags are AI estimates — always check the label." (use the existing household-scope logic; personal wording when no household).
- **Summary card** (`card` bg): kicker "AVOIDING" (`actionText`), the selected items joined as text (or a "Nothing yet" empty line), and a footnote "Recipes with these get a warning banner". The summary text cross-fades when it changes.
- **ALLERGENS · EU 14**: wrap of selectable `Pill`s from `packages/shared/src/utils/allergenKeys.ts`.
- **INTOLERANCES**: wrap of selectable `Pill`s.
- Tapping a chip toggles it with a light haptic and saves through the existing preferences/allergen mutation (same logic as today's `AllergenSection`, including optimistic update and debounce/in-flight protection). Show the existing allergen recheck progress/complete/failed message under the summary when a recheck is running.
- Move logic out of `SettingsScreen/AllergenSection.tsx`. Delete that file once nothing uses it.

### 3. Household (`src/screens/HouseholdDetailScreen.tsx` → split into `HouseholdDetailScreen/`)

Restyle to design B, keeping all current capabilities (rename, colour, rotate code, members, promote/remove, leave):

- **Identity header**, centred: household name (`recipeTitle`-ish, tappable to rename via the existing flow), "N people · M recipes shared" (use existing data; omit the recipes part if no count is available without new API work), and a row of 7 colour swatches (`householdColors` from shared). The selected swatch shows a ring. Changing colour updates the avatar live (optimistic), with a spring scale on the selected swatch.
- **Invite card** (light peach tint): title "Invite someone", subtitle, then `SegmentedControl` (Link or code / Email):
  - *Link or code*: the join code in a white field (monospace, tabular, letter-spaced) + primary "Share" button (native `Share.share`). Keep "rotate code" reachable (e.g. long-press the code or an ActionSheet, whichever matches existing behaviour best).
  - *Email*: email `TextInput` (`keyboardType="email-address"`, `autoCapitalize="none"`, `textContentType="emailAddress"`, `returnKeyType="send"`) + primary "Send" (existing invitation endpoint with `invited_email`). Validate the email and show inline error/success.
  - Switching tabs cross-fades the content (`fadeIn`/`exitFade`), with the card height animating via `layout`.
- **MEMBERS**: `SettingsGroup` of member rows (`Avatar` with initials, "Name (you)", role line "Admin · can edit everything" / "Member · can add and edit recipes"). Admins see a surface "Edit" button on other members' rows → `ActionSheetIOS` with "Make admin" and "Remove from household" (destructive, with `Alert` confirm). Member removal animates out.
- **DANGER ZONE**: "Leave household" destructive row (existing confirm + navigation back).
- Respect existing admin/member permissions from the API (`role` in `MemberOut`).

### 4. Shopping categories (`src/screens/ShoppingCategoriesScreen.tsx`)

- Intro text (`subtitle`, `textSecondary`): "Turn categories on or off and drag to match the order you walk through your shop."
- One card with a drag handle (≡), category name and `Switch` per row, plus a locked final "Other" row with a lock icon and subtitle "Always on, catches everything else" (not draggable, no switch).
- Keep `react-native-draggable-flatlist` and existing persistence. Restyle to theme tokens (it currently uses `secondarySystemGroupedBackground`, radius 10, margin 16; move to `card`/`radius.card`/`screenGutter`). Use `SettingsRow` for the row content. Lift the dragged row with `ScaleDecorator` + haptic on pick-up and drop.
- No "+ Add category".

### 5. My recipes (`src/screens/MyRecipesScreen.tsx` + `SettingsScreen/MyRecipesSection.tsx`)

- Search field "Search N recipes" at the top. Filters the list client-side (or with the existing query param if the hook supports it), debounced.
- Caption "Recipes you added to {household}".
- `FlatList` of `RecipeRow`s with thumbnail (or initials placeholder tile with a soft tinted bg when no image), title (1 line, ellipsis), "{time} · {category}", chevron → recipe detail.
- **No** "Added by me / Whole household" switch. Check what `MyRecipesSection` does today and drop that toggle.
- Rows animate in with a short stagger on first load only, `layout` on filter changes. Loading = `ActivityIndicator`, plus an empty state for zero recipes and for no search results.
- Fold `MyRecipesSection.tsx` into the screen folder if it is only used here.

### 6. Report an issue (`app/bug-report.tsx` → `src/screens/BugReportScreen/`, route file re-exports)

- Intro "Something not working, or an idea for Carrot? Tell us in your own words."
- Multiline field (`card` bg, hairline `dividerCard` border, radius `card`, ~210pt min height, placeholder "What happened?").
- Full-width "Send" `Button`: secondary/disabled look while empty, primary when there is text, loading while sending. Keep the existing Sentry submission, flush, haptics and error handling.
- On success, cross-fade the form out and show the thanks state: a 56pt `tint` circle with an orange check that springs in, "Thanks, we got it" (`groupTitle`), "We read every report. If we need more detail, we'll email you." and a secondary "Back to settings" button (`router.back()`).
- `KeyboardAvoidingView behavior="padding"`.

## Animation patterns (use `src/theme/motion.ts`)

- Screen content on mount: `entering` (FadeInDown 250ms) on each top-level group, staggered ≤40ms per group, first mount only.
- List insert/remove: `rowEntering` / `rowExiting` / `rowLayout` on every row that can be added or removed (households, invitations, members, allergen summary).
- State swaps (invite tabs, report form → thanks, summary text): `fadeIn` / `exitFade` with the parent on `layout`.
- Press feedback: `usePressScale` on every pressable card/row/button (already in `Card`/`Button`. Make sure `SettingsRow` uses it).
- Selection (chips, swatches, segmented): animated colour/scale with `settleSpring`.
- Everything goes through `useMotion()` so Reduce Motion disables it.

## Routes to add or update

- `app/(tabs)/settings/_layout.tsx`: add `allergies` (and keep `my-recipes`, `shopping-categories`). Set titles via `HeaderTitle`.
- `app/(tabs)/settings/allergies.tsx`: re-export `src/screens/AllergiesScreen`.
- `app/bug-report.tsx`: re-export the new screen folder.

## Verification

- `pnpm --filter mobile exec tsc --noEmit` (or the repo's mobile typecheck script) passes.
- Lint passes for touched files.
- No hex literals added outside `src/theme/colors.ts` (`grep -rnE "#[0-9A-Fa-f]{6}" src/screens/SettingsScreen src/screens/AllergiesScreen src/screens/HouseholdDetailScreen src/screens/BugReportScreen src/components/ui`).
- All 7 locale files contain every new key (compare key sets).
- Manually walk through the light and dark modes for each screen against the renders.
