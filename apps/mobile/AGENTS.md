# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Bottom sheets

- Use `@gorhom/bottom-sheet`'s `BottomSheetModal` for every bottom card/sheet. Do not build a bespoke React Native `Modal` bottom sheet.
- Match the Add Recipe drawer: `enablePanDownToClose`, a `BottomSheetBackdrop` that dismisses on tap, the standard handle indicator, and `secondarySystemBackground` as the sheet surface.
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

## Share extension

`expo-sharing` in `app.json` creates and embeds the iOS Share Extension
during every prebuild. Keep its extension bundle ID
`com.kulesza.carrot.ShareExtension` and App Group
`group.com.kulesza.carrot` aligned with the identifiers registered in
Apple Developer.
