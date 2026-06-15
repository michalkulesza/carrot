# TestFlight Internal Testing — Pre-flight Checklist

Target: upload a signed production build to Apple TestFlight for internal testing (up to 100 testers, no Apple review required).

---

## Blockers — must fix before building

### 1. App name is "mobile"

`app.json` `name` and `slug` are both `"mobile"`. The iOS `Info.plist` `CFBundleDisplayName` is also `"mobile"`. This will be the name displayed on the home screen and in App Store Connect.

**Fix:**
- `app.json`: change `"name"` → `"PlateKeeper"`, `"slug"` → `"platekeeper"`
- `ios/mobile/Info.plist`: change `CFBundleDisplayName` value from `"mobile"` → `"PlateKeeper"`
- Regenerate native project or do a prebuild (`npx expo prebuild --clean`) after changing `app.json`

### 2. App Store Connect record must exist

The EAS `projectId` (`d8507eab-05ed-4623-9f23-1114227f11a8`) links to Expo's cloud, but a separate record in App Store Connect must exist for the bundle ID `com.kulesza.platekeeper`.

**Fix:**
1. Log into [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. My Apps → "+" → New App
3. Platform: iOS, Name: PlateKeeper, Bundle ID: `com.kulesza.platekeeper`, SKU: any unique string (e.g. `platekeeper`)
4. Language: English (or Polish)

### 3. EAS submit configuration is empty

`eas.json` `submit.production` is `{}` — EAS won't know which App Store Connect app to upload to.

**Fix in `eas.json`:**
```json
"submit": {
  "production": {
    "ios": {
      "appleId": "kulesza.michal@gmail.com",
      "ascAppId": "<the numeric App Store Connect App ID shown in App Store Connect>",
      "bundleIdentifier": "com.kulesza.platekeeper"
    }
  }
}
```
`ascAppId` is the 10-digit number in the App Store Connect URL after `/apps/`.

### 4. Build number must increment on every TestFlight upload

TestFlight rejects a build with the same `CFBundleVersion` as a previous upload. Currently no auto-increment is configured.

**Fix — add to `eas.json` production profile:**
```json
"production": {
  "autoIncrement": true,
  "env": {
    "EXPO_PUBLIC_API_URL": "https://api.recipes.xcxz.xyz"
  }
}
```

---

## Important — fix before shipping but won't block upload

### 5. Dark mode: user preference switch in Settings

`app.json` sets `"userInterfaceStyle": "light"`, locking the app to light mode despite the entire codebase already using `PlatformColor` for dark/light adaptation. Rather than just flipping to `"automatic"` (which silently follows the system), give the user an explicit choice in Settings.

**Plan:**
1. Change `app.json` to `"userInterfaceStyle": "automatic"` so the OS can override at all.
2. Add a `theme` field (`'light' | 'dark' | 'system'`) to `UserPreferences` (backend + shared types).
3. In `SettingsScreen`, add a three-option segmented control (Light / Dark / System) in the Appearance section — use `ActionSheetIOS` or three `Pressable` chips, same pattern as the week-start picker.
4. Wrap `_layout.tsx` root with a `<ThemeProvider>` that reads the preference and calls `Appearance.setColorScheme('light' | 'dark' | null)` from `react-native` — `null` means follow system. This overrides the OS setting per-app without needing a full theme context.
5. Splash screen: switch the `backgroundColor` from `#c0f0d0` to a neutral `#ffffff`/`#000000` pair via `app.json` `splash.dark` (Expo 50+ supports dark splash config).

**Files to touch:** `app.json`, `packages/shared/src/types.ts`, `services/api/src/api/models.py` (add column), `SettingsScreen.tsx`, `app/_layout.tsx`.

### 6. Replace import stage text list with a progress bar

The import pipeline emits up to 9 named stage events (e.g. `fetching_metadata`, `checking_description`, `analyzing_transcript`, …). Currently each stage is rendered as a text row with `✓` / `⋯` icons. Replace this with a single horizontal progress bar + current stage label, which reads more cleanly and takes less vertical space.

**Plan:**
- Define `KNOWN_STAGES` — an ordered array of the 9 keys the backend can emit (`fetching_page`, `analyzing_page`, `fetching_metadata`, `checking_description`, `checking_links`, `fetching_transcript`, `analyzing_transcript`, `analyzing_text`, `analyzing_image`). Not all stages fire on every import; treat total as dynamic (count of events received + 1 for the in-flight one).
- Replace the `progressList` / `progressRow` UI in `UrlInputView`, `TextPasteView`, and the camera/gallery inline block with a shared `<ImportProgressBar>` component.
- `ImportProgressBar` receives `progressSteps: StepState[]` and renders:
  - A thin (4pt) rounded track (`systemGray5`) with a filled portion (`brand`) using `Animated.Value` driven by `doneCount / estimatedTotal`.
  - The current active stage label below in `secondaryLabel`, 12pt. Hidden once all steps are done.
  - Animate fill with `Animated.timing` (250ms ease-out) on each new stage.
- Remove the `ActivityIndicator` spinners that currently sit below the progress list; the bar itself communicates loading state.
- Stage labels come from the server (`s.label`), already human-readable English. No i18n change needed for now.

**Files to touch:** `ImportRecipeScreen.tsx` (extract `ImportProgressBar`, replace 4 inline `progressList` blocks), styles (`progressList`, `progressRow`, `progressIcon`, `progressLabel`, `progressActive`, `spinner` → `progressTrack`, `progressFill`, `progressText`).

### 7. Error handling: generic messages in production + Sentry

Currently `catch` blocks and API error strings are forwarded directly to the UI (`setError(err instanceof Error ? err.message : ...)`). Two fixes needed together:

**7a. Gate error detail on `__DEV__`:**
```ts
setError(__DEV__ ? (err instanceof Error ? err.message : String(err)) : t('common.errorGeneric'))
```
Add `common.errorGeneric` to all 5 locale files: `"Something went wrong. Please try again."` Keep specific, *actionable* errors (e.g. `"This URL isn't supported"`, `"No internet connection"`) as-is — only swallow errors the user cannot act on.

**7b. Add Sentry so crashes are visible:**
```bash
npx expo install @sentry/react-native
```
- Create a free Sentry project at sentry.io, grab the DSN.
- Add `EXPO_PUBLIC_SENTRY_DSN` to `eas.json` production `env`.
- In `app/_layout.tsx` root, initialise before the component tree:
```ts
import * as Sentry from '@sentry/react-native'
Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, enabled: !__DEV__ })
```
- In each `catch` block that swallows the real error, add `Sentry.captureException(err)` so it still reaches the dashboard.
- Wrap the default export of `_layout.tsx` with `Sentry.wrap(RootLayout)` for automatic JS error boundary capture.

**Files to touch:** `app/_layout.tsx`, `ImportRecipeScreen.tsx`, all 5 locale files, `eas.json`.

### 9. Dev / prod environment files

Currently `.env` is manually commented/uncommented to switch between the local API and production. `pnpm dev:ios` already starts the local API, so the env should switch automatically.

**Plan:**
- Rename `apps/mobile/.env` → `apps/mobile/.env.development` with the local IP URL.
- Create `apps/mobile/.env.production` with the production URL.
- Rename `apps/mobile/.env.example` → `apps/mobile/.env.development.example` (template with `http://192.168.1.x:8088`).
- Add `.env.development` to `.gitignore` (IP is machine/network-specific); commit `.env.production` (public URL is fine).
- Remove the duplicate `EXPO_PUBLIC_API_URL` from `eas.json` `env` blocks — `.env.production` covers it and EAS respects it.

**How it works:** `expo run:ios` (called by `pnpm dev:ios`) sets `NODE_ENV=development` and Expo auto-loads `.env.development`. EAS production builds set `NODE_ENV=production` and load `.env.production`. No more manual commenting.

**Files to touch:** `apps/mobile/.env` (rename/delete), `apps/mobile/.env.development` (new), `apps/mobile/.env.production` (new), `apps/mobile/.gitignore` or root `.gitignore`, `apps/mobile/eas.json` (clean up duplicate env vars).

---

## UI bugs

### 10. Household name field incorrectly labelled "(optional)"

`en.json` key `householdNameOptional` is `"Name (optional)"` and all other locale files mirror it. The household name is required — an unnamed household makes no sense.

**Fix:** Change the translation key value to `"Name"` (or `"Household name"`) in all 5 locale files. The key itself can stay as-is or be renamed to `householdName`.

### 11. Import modal back button reads "Add Recipe"

The `/import-recipe` screen previously had `headerShown: false`; it was changed to `presentation: 'modal'` only, so iOS now renders a visible navigation header. The parent route is the "Add Recipe" tab, whose label (`t('nav.addRecipe')`) bleeds through as the back button title.

**Fix:** In `app/_layout.tsx`, add an explicit title to the import-recipe screen so it isn't derived from the tab label:
```tsx
<Stack.Screen
  name="import-recipe"
  options={{ presentation: 'modal', title: t('addRecipe.title'), headerBackTitle: '' }}
/>
```
`addRecipe.title` should already exist in the locale files; verify and add if missing.

### 12. Header buttons have more space on the right than the left

In `RecipesScreen.tsx`, the three `headerRight` buttons (sort sliders, bell, settings) sit in a `View` with `gap: 4` and `paddingHorizontal: 4`. iOS adds its own system trailing inset to `headerRight` content, making the group appear pushed further from the right edge than the title is from the left.

**Fix:** Add a negative right margin to pull the button group flush with the system-standard right edge:
```ts
headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: -8 },
```
Adjust the value by eye after testing on device (`-8` is the standard correction for native-stack headers on iOS).

---

## Cleanup — nice to have, no impact on upload

### 8. Placeholder Expo assets still in repo

The following files from the default Expo template are in `assets/` and committed to git:
- `partial-react-logo.png`
- `react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`

They are not referenced by `app.json` and serve no purpose. Delete them.

---

## Build & Upload steps (once blockers are resolved)

```bash
# From apps/mobile
# 1. Build a signed production IPA on EAS cloud
pnpm exec eas build --platform ios --profile production

# 2. Submit the build to TestFlight (EAS uploads directly)
pnpm exec eas submit --platform ios --profile production --latest

# Or combine into one command:
pnpm exec eas build --platform ios --profile production --auto-submit
```

EAS manages the distribution certificate and provisioning profile automatically (managed credentials). It will prompt you to authenticate with your Apple ID the first time.

---

## TestFlight internal tester setup

1. In App Store Connect → your app → TestFlight → Internal Testing
2. Add testers by Apple ID (must be a member of your App Store Connect team)
3. Maximum 100 internal testers, no Apple review, builds available immediately after processing (~10–30 min)
4. Testers install via the TestFlight app on their device

---

## Summary

| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Fix app name from "mobile" → "PlateKeeper" | ❌ Not done | Blocker |
| 2 | Create App Store Connect app record | ❌ Not done | Blocker |
| 3 | Configure `eas.json` submit section | ❌ Not done | Blocker |
| 4 | Enable `autoIncrement` in production profile | ❌ Not done | Blocker |
| 5 | Dark mode user preference switch in Settings | ❌ Not done | Important |
| 6 | Replace import stage text list with progress bar | ❌ Not done | Important |
| 7a | Gate raw error messages behind `__DEV__` | ❌ Not done | Important |
| 7b | Add Sentry crash reporting | ❌ Not done | Important |
| 8 | Remove placeholder Expo assets | ❌ Not done | Cleanup |
| 9 | Dev/prod `.env` split tied to `pnpm dev:ios` | ❌ Not done | Important |
| 10 | Household name field: remove "(optional)" label | ❌ Not done | Bug |
| 11 | Import modal back button shows "Add Recipe" | ❌ Not done | Bug |
| 12 | Header buttons: extra right margin vs left | ❌ Not done | Bug |

**What's already good:**
- Bundle ID `com.kulesza.platekeeper` and Apple Team ID `Q8L6CUF7BC` are set in the Xcode project
- `ITSAppUsesNonExemptEncryption: false` declared (skips export compliance questionnaire)
- Camera and Photo Library privacy strings are in `Info.plist`
- App icon is 1024×1024 (correct size)
- EAS project ID is wired up
- API URL points to production (`https://api.recipes.xcxz.xyz`) in the production EAS profile
- Share Extension bundle ID follows the correct pattern (`com.kulesza.platekeeper.ShareExtension`)
