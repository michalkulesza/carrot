# Android release

The mobile app builds for Android (`apps/mobile`, package `com.kulesza.carrot`), but some
features only work on iOS so far. This page lists what Android still needs before a public release.

## Status

| Area | iOS | Android |
| --- | --- | --- |
| Recipes, meal plan, shopping, households, invitations | ✅ | ✅ |
| Local timer-done notifications | ✅ | ✅ |
| Server push (import done/failed, invitation, member left) | ✅ APNs | ❌ not delivered |
| Removing outdated pushes (silent retract) | ✅ | ❌ |
| Running timers outside the app | ✅ Live Activity | ❌ |
| Share-sheet import | ✅ | ⚠️ not verified |

Since the in-app bell was removed (see [specs/completed/notifications-to-push.md](specs/completed/notifications-to-push.md)),
Android users currently get **no** import or invitation notifications at all.

## 1. Push notifications via Firebase Cloud Messaging

Today the backend only talks to APNs (`services/api/src/api/services/apns.py`). On Android,
`getDevicePushTokenAsync()` returns an FCM token, which is registered like an APNs token and then
rejected by APNs (and pruned as dead).

- [ ] Create a Firebase project, add an Android app for `com.kulesza.carrot`, download
      `google-services.json` into `apps/mobile/` and set `expo.android.googleServicesFile` in `app.json`.
- [ ] Create a Firebase service account with the *Firebase Cloud Messaging API* role; add its JSON as a
      secret (`FCM_SERVICE_ACCOUNT_JSON`) to `services/api/.env`, `services/api/.env.example` and the VPS.
- [ ] Add a `platform` column (`ios` | `android`) to `device_subscriptions` (startup DDL in `main.py`)
      and send it from `api.registerDevice` (`Platform.OS`).
- [ ] New `services/fcm.py` (HTTP v1 API, OAuth token from the service account, cached), returning the
      same `PushResult` as `apns.py`; treat `UNREGISTERED` / `INVALID_ARGUMENT` token errors as dead tokens.
- [ ] `services/push.py`: route `notify_user` / `retract` by platform.
  - Alerts → FCM `notification` + `data` (`type`, `collapse_id`, ids), `android.notification.tag = collapse_id`
    so a newer push with the same tag replaces the old one (e.g. "imported" replaces "import failed").
  - Retract → data-only message `{type: "retract", collapse_id}` with high priority.
- [ ] Notification channels: create `imports` and `household` channels on app start
      (`Notifications.setNotificationChannelAsync`) and set `android.notification.channel_id`.
- [ ] Client: the background task in `apps/mobile/src/lib/backgroundNotificationTask.ts` already handles
      `retract`; verify it runs for FCM data-only messages when the app is killed, and that
      `dismissPresentedByCollapseId` finds notifications by `data.collapse_id` on Android.
- [ ] Request `POST_NOTIFICATIONS` (Android 13+) — `usePushRegistration` already calls
      `requestPermissionsAsync()`; verify the prompt appears.
- [ ] Tests: FCM payload shape, platform routing, dead-token pruning.

## 2. Running timers outside the app

iOS uses a Live Activity (`apps/mobile/targets/timer-activity`, `modules/timer-live-activity`).
Android's equivalent is an ongoing notification with a live countdown.

- [ ] Add an Android implementation to `modules/timer-live-activity` (Kotlin) behind the same
      `sync(timers)` / `endAll()` / `readPendingChanges()` API, so `TimerContext` needs no changes.
- [ ] One ongoing, non-dismissible notification in a `timers` channel: soonest-ending timer as the title
      with `setUsesChronometer(true)` + `setChronometerCountDown(true)` + `setWhen(endDate)`, other timers as
      lines (`InboxStyle`).
- [ ] Pause / Resume / Cancel actions via a `BroadcastReceiver` that updates the notification, cancels or
      reschedules the timer-done alarm, and records a pending change for JS to reconcile (same
      `PendingTimerChange` shape as iOS).
- [ ] Check Android 14 foreground-service rules: an ongoing notification alone needs no foreground
      service; only add one if the countdown must survive the app process being killed.

## 3. iOS-only UI primitives

- [ ] **SF Symbols render nothing on Android.** `expo-symbols` `SymbolView` is used app-wide (row icons, chevrons, pill remove buttons, checkboxes, steppers, thumbnails). Add an icon component that renders `SymbolView` on iOS and a Material Symbols / vector-icon equivalent on Android (the tab bar already maps `sf` → `md` names), then replace direct `SymbolView` usage.
- [ ] **`ActionSheetIOS` / `Alert.prompt` outside Settings.** Settings and Household use `useActionMenu()` / `usePrompt()` from `src/context/DialogContext.tsx` (iOS: `ActionSheetIOS` / `Alert.prompt`; Android: `AppSheet`-based `ActionMenuSheet` / `PromptSheet` in `src/components/dialogs/`); other screens still call the iOS APIs directly (e.g. `BrowseScreen/useRecipeActions.ts`, `MealPlanScreen/useDishActions.ts`, `GettingStartedScreen`, `ShoppingListScreen/useClearDone.ts`, `HomeScreen/useImportJobActions.ts`, `RecipeDetailScreen`). Move them to the same helpers.

## 4. Release checklist

- [ ] Signing: create the upload keystore via EAS (`eas credentials -p android`).
- [ ] `eas.json`: add an Android `submit.production` profile (Play service account key, track `internal`).
- [ ] Play Console: app listing, content rating, data safety form (account email, recipes, push tokens,
      Sentry crash data), privacy policy URL.
- [ ] Verify on a physical device: Google sign-in (Android OAuth client SHA-1), share-sheet import,
      deep links (`carrot://`), predictive back disabled, dark mode, edge-to-edge insets.
- [ ] Internal testing track → closed testing → production.
