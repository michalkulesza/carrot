# Plan: Global bug-report button → Sentry User Feedback

A bug-report button on the top-right of every (non-auth) screen. Tapping it
screenshots the current screen, opens a native modal form (prefilled with the
logged-in user's email), and submits to Sentry via the User Feedback API
(`captureFeedback`) with the screenshot attached.

## Decisions (resolved during design review)

- **Report UI:** custom native iOS form (not Sentry's built-in widget), email prefilled from the logged-in user.
- **Placement:** Approach A — a shared standalone `<BugReportButton />` wired into each screen's `headerRight`. Placed **left of** `<BellMenu />` where the bell exists. Not paired with the bell on screens that don't already have one — bug button only (no scope creep).
- **Screenshot:** `react-native-view-shot` `captureScreen()`, taken on button tap **before** the modal opens. Optional — if capture fails, the report still submits without a screenshot.
- **Form presentation:** an expo-router modal route (`app/bug-report.tsx`, `presentation: 'modal'` = native iOS card sheet). Screenshot passed as a route param.
- **Form fields:** Description (required, multiline, `autoFocus`), Email (prefilled, editable), Screenshot thumbnail preview (removable).
- **Silent context:** current route, app version + build, user id, household id — attached as Sentry `captureContext.tags`.
- **Submit UX:** disable + spinner → `captureFeedback(...)` → **`await Sentry.flush(5000)`** for hard confirmation.
  - `true` → success haptic, confirmation, dismiss.
  - `false` (timeout/offline) or throw → error haptic, keep form intact, inline "couldn't send — check connection," re-enable submit for retry.
- **Icon:** `<Feather name="alert-triangle" size={22} color={colors.secondaryLabel} />`, matching the bell's size/color/hit treatment (`padding: 4` + `hitSlop`, 44pt target).

## Sentry API (verified against RN docs)

```js
Sentry.captureFeedback(
  { message, email },                 // name optional; no associatedEventId (standalone)
  {
    captureContext: { tags: { route, appVersion, userId, householdId } },
    attachments: shot
      ? [{ filename: 'screenshot.png', data: <Uint8Array>, contentType: 'image/png' }]
      : [],
  },
)
await Sentry.flush(5000)
```

Attachment `data` needs **bytes**, not a file URI: `captureScreen({ result: 'base64' })` → decode base64 → `Uint8Array`.

## New dependency

- `react-native-view-shot` (via `npx expo install`). Native module — OK on the existing dev build.

## New files

1. **`src/components/BugReportButton.tsx`** — standalone header button. `onPress`: `captureScreen({ result: 'base64' })` → `router.push('/bug-report?shot=<base64>')`; on capture failure push with no `shot`.
2. **`app/bug-report.tsx`** — modal route. `<KeyboardAvoidingView behavior="padding">`. Fields as above. Submit flow + hard-confirm as above.

## Edited files

3. **`app/_layout.tsx`** — register `<Stack.Screen name="bug-report" options={{ presentation: 'modal' }} />`; add `headerRight: () => <BugReportButton />` to the central `import-recipe`, `recipe/[id]`, `recipe/[id]/edit`, `household/[id]` registrations.
4. **Inline-header screens** — add `<BugReportButton />` left of `<BellMenu />`:
   - `app/(tabs)/shopping/index.tsx`
   - `src/screens/SettingsScreen.tsx`
   - `src/screens/RecipesScreen.tsx`
   - `src/screens/MealPlanScreen.tsx`
   - `src/screens/RecipeDetailScreen.tsx`
5. **5 locale files** (en, pl, de, fr, es) — new `bugReport` namespace: `title`, `descriptionLabel`, `descriptionPlaceholder`, `emailLabel`, `screenshot`, `removeScreenshot`, `submit`, `submitting`, `success`, `sendFailed`.

## Excluded

- `(auth)` screens (not logged in, no email to prefill).
- `share.tsx` (headless redirect, no UI).
- The `bug-report` modal itself.
- The bell is **not** added to screens that lack it.

## Commit

Commit on completion with a descriptive message; include this plan file.
