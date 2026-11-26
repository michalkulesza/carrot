# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Bottom sheets

- Use `@gorhom/bottom-sheet`'s `BottomSheetModal` for every bottom card/sheet. Do not build a bespoke React Native `Modal` bottom sheet.
- Every sheet uses `enablePanDownToClose` and the shared look from `src/components/ui/sheet.tsx`: `backdropComponent={renderSheetBackdrop}`, `backgroundComponent={SheetBackground}` (fades its shadow out as the sheet closes), `handleIndicatorStyle={sheetStyles.handle}`. Don't define per-sheet background, handle or backdrop styles.
- List/select sheets (tags, related recipes, meal-plan dishes, anything with search + checkbox rows + chips) are built on `SelectionDrawer` from `src/components/SelectionDrawer`; don't hand-roll a new picker sheet. It owns present/dismiss, the header, search, chips and the virtualised sectioned list; pass `sections`, `renderItem` (use `SelectionRow`) and optional `listHeader` (`CreateRow`/`QuickAddRow`).
- Content-sized sheets (`enableDynamicSizing`) need a minimum height of half the window.
- Do not add close, done, or cancel buttons solely to dismiss a bottom sheet. A sheet must close by tapping the backdrop or pulling it down. Keep action buttons only when they perform a real domain action.

## Full-screen cooking UI

- Respect top and bottom safe-area insets, and use `useResolvedColorScheme()` so screens follow Carrot's Appearance preference rather than only the device trait.
- Timer displays based on timestamps must trigger a one-second render tick while running.
- When step typography is auto-fitted, measure it before revealing the new step; fade out, fit while hidden, then fade in to avoid visible reflow.

## Dark mode

- Treat `ColorSchemeProvider` as the single source of truth. Read the effective theme with `useResolvedColorScheme()` whenever code needs an explicit `light` or `dark` value, including native-module props and manually selected colors.
- Keep the persisted preference as `light | dark | system`. Apply `system` to React Native with `Appearance.setColorScheme('unspecified')`; never pass `null` or cache a second copy of the system color scheme.
- Use the shared `HeaderTitle` for custom native-stack titles. Set `headerTintColor` and `headerTitleStyle` from `useResolvedColorScheme()` in the owning stack layout so every nested screen, including back controls, inherits the correct color. Do not use `PlatformColor('label')` as a per-screen header override.
- iOS screen content may use semantic `PlatformColor`/`DynamicColorIOS` values because the provider synchronizes the native Appearance override. Code that branches on the theme must still use `useResolvedColorScheme()`.
- Keep app content covered until the persisted appearance preference has loaded and the native colors have updated. Splash and post-splash surfaces must be opaque so an unthemed light frame cannot show through.
- Preserve `userInterfaceStyle: 'automatic'` and the `expo-system-ui` dependency so automatic appearance works in native builds.

## Navigation

- Reuse the app's standard transparent back control: a `Feather` `chevron-left` (24px) with the localized “Back” label, as in `useNewRecipeHeader`. Do not introduce a bespoke floating, glass, or pill-shaped back button unless that pattern has been adopted app-wide.

## Share extension

`expo-sharing` in `app.json` creates and embeds the iOS Share Extension
during every prebuild. Keep its extension bundle ID
`com.kulesza.carrot.ShareExtension` and App Group
`group.com.kulesza.carrot` aligned with the identifiers registered in
Apple Developer.
