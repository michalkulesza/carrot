# App Store Review Guidelines — Compliance Check

Audit date: 2026-07-08, against [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Scope: `apps/mobile` (Carrot, `com.kulesza.carrot`) moving from TestFlight-internal (no review) to public TestFlight/App Store distribution (requires review).

App profile relevant to this audit: email/password auth + Google Sign-In, camera/photo import for recipes, local (not push) notifications for cooking timers, allergen/dietary/nutrition data, no IAP, no HealthKit, no ads, no analytics SDK besides Sentry crash reporting.

---

## Blockers — will very likely cause rejection

### 1. No privacy policy anywhere (Guideline 5.1.1(i)) — ✅ Fixed

Searched the whole repo (`apps/mobile`, `apps/web`, `apps/showcase`) — there is no privacy policy page, no link to one, and no `Legal`/`Privacy` section in `SettingsScreen.tsx`. Apple requires:
- A privacy policy URL in the App Store Connect metadata field, **and**
- The same policy accessible from inside the app (typically a link in Settings).

It must explicitly state:
- **What is collected**: email, password hash, name, recipes (including imported text/images), household membership, allergen/intolerance data (predefined + custom + reanalysis results), unit/language/appearance preferences, crash data (Sentry).
- **How**: user input, email/password or Google Sign-In, camera (`ImportRecipeScreen.tsx`) / photo library (`RecipeDetailScreen.tsx`, `ImportRecipeScreen.tsx`), automatic crash capture.
- **Third parties data is shared with**: Google (auth), Sentry (crash reporting), the backend/image-storage host (R2, per `docs/r2-image-storage.md`) — and confirmation each provides equivalent protection.
- **Retention/deletion policy** and **how to revoke consent / request deletion** — ties directly into blocker #2.

**Fix:** write a privacy policy (web page under `apps/web` or `apps/showcase` is fine), link it from App Store Connect, and add a "Privacy Policy" row to the Account/Legal section of `SettingsScreen.tsx`.

**Done:** `apps/showcase` now serves `carrot.xcxz.xyz/privacy-policy` covering exactly the data/third-party/retention points above, in all 5 locales. `SettingsScreen.tsx` has a "Privacy Policy" row linking to it. Still need to paste the URL into the App Store Connect metadata field before submitting.

### 2. No account deletion in the app (Guideline 5.1.1(v)) — ✅ Fixed

`SettingsScreen.tsx` (Account section, ~line 487-506) only offers **Log Out**. There is no "Delete Account" action, and a repo-wide search found no `DELETE`-account endpoint in `services/api`. Apple's text is unambiguous: *"If your app supports account creation, you must also offer account deletion within the app."* Logging out does not satisfy this.

**Fix:**
- Add a backend endpoint that deletes/anonymizes the user's account (and clarify what happens to shared households/recipes owned jointly — e.g. household ownership transfer or orphaning logic).
- Add a destructive "Delete Account" row in `SettingsScreen.tsx`'s Account card, gated by `Alert.alert` confirmation (per existing convention, e.g. `handleLogout`), that calls the new endpoint and then logs the user out.
- Surface a completion/confirmation message.

**Done:** `DELETE /api/users/me` (self-service, `services/api/src/api/main.py`) hard-deletes the account and everything owned by it via the existing `ON DELETE CASCADE` FKs, and purges R2 thumbnails first. Shared households/recipes get hard-deleted along with the user rather than reassigned (explicit call — see conversation). `SettingsScreen.tsx` has a destructive "Delete Account" row next to Log Out with an `Alert.alert` confirmation. Also fixed `DELETE /api/recipes/{id}` to purge its R2 thumbnail, which it never did before.

### 3. Google Sign-In credential revocation (Guideline 4.8) — ✅ Fixed

Email/password registration exists (`RegisterScreen.tsx` only requires email + password) and is presented alongside Google Sign-In on both `LoginScreen.tsx` and `RegisterScreen.tsx` — this satisfies the "equivalent login option" requirement itself (data collection is minimal: just email).

What's unverified: guideline 4.8 also requires *"a mechanism to revoke social network credentials and disable data access between the app and social network from within the app"* for users who signed up via Google. Confirm that `logout()` in `AuthContext.tsx` actually calls `GoogleSignin.signOut()` (or revokeAccess) for Google-linked accounts, not just clearing the local `SecureStore` token — otherwise the Google session/grant persists beyond app logout.

**Done:** revocation is wired to account deletion, not logout (logout keeps the Google session so re-login doesn't force fresh consent every time). `apps/mobile/src/utils/googleAuth.ts` adds `revokeGoogleSignin()` (`GoogleSignin.revokeAccess()` + `signOut()`, best-effort/no-op if not Google-linked), called from `deleteAccount()` in `AuthContext.tsx` before the local session is cleared.

---

## Important — should fix before submitting

### 4. No public Support URL / contact page — ✅ Fixed

App Store Connect requires a **Support URL** in app metadata (Guideline 1.5). The in-app bug-report flow (`BugReportButton.tsx` → `/bug-report`) is good and helps satisfy "easy way to contact you in app," but no public support/contact page was found in `apps/showcase` (the marketing site) to use as the Support URL. Add one (even a simple contact-email page) before submitting in App Store Connect.

**Done:** `apps/showcase` now serves `carrot.xcxz.xyz/support` — a plain contact page (mirroring the Privacy Policy page's layout) with a `mailto:kulesza.michal@gmail.com` link, in all 5 locales, linked from the site footer. Still need to paste the URL into the App Store Connect "Support URL" metadata field before submitting.

### 5. Photo library permission forces full access instead of the limited picker (Guideline 5.1.1(iii)) — ✅ Fixed

In `RecipeDetailScreen.tsx:700` and `ImportRecipeScreen.tsx:307,1283`, the code calls `ImagePicker.requestMediaLibraryPermissionsAsync()` **before** `launchImageLibraryAsync()`. On iOS 14+, `launchImageLibraryAsync` can show the native `PHPickerViewController` without requesting any library permission at all — calling `requestMediaLibraryPermissionsAsync` first forces the full "Allow Access to Photos" system prompt (Full/Limited/None), which is exactly the over-broad access pattern guideline 5.1.1(iii) asks apps to avoid ("use the out-of-process picker... rather than requesting full access").

**Fix:** drop the explicit `requestMediaLibraryPermissionsAsync()` call for the picker flows and let `launchImageLibraryAsync` handle it natively (keep the permission request only where you truly need direct library read access outside the picker, if anywhere). Camera capture (`requestCameraPermissionsAsync`, `ImportRecipeScreen.tsx:1257`) does need an explicit permission and is fine as-is.

**Done:** removed the `requestMediaLibraryPermissionsAsync()` pre-check from all 3 gallery-picker call sites (`RecipeDetailScreen.tsx`'s `handlePickThumbnail`, `ImportRecipeScreen.tsx`'s `handlePickImage` and `handleGallery`); `launchImageLibraryAsync` now runs directly and shows the native limited picker without ever requesting full library access. Camera permission checks were untouched. The now-dead `recipes.galleryPermissionDenied(Msg)` / `addRecipe.galleryPermissionDenied(Msg)` translation keys were removed from all 5 locale files in `packages/shared/src/locales`.

### 6. Unused privacy purpose strings in `Info.plist` — ✅ Fixed

`ios/Carrot/Info.plist` declares:
- `NSMicrophoneUsageDescription` — no microphone/audio-recording code found anywhere; all `ImagePicker` calls use `mediaTypes: ['images']` only (no video).
- `NSFaceIDUsageDescription` — no `expo-local-authentication`/`LocalAuthentication` usage found; `SecureStore` calls in `AuthContext.tsx` don't set a biometric-gated `keychainAccessible` option.

These are almost certainly Expo template boilerplate. Unused purpose strings aren't an automatic rejection, but reviewers do sometimes flag permission strings that don't match actual app behavior (5.1.1(ii)/2.5.14 expect strings to reflect real usage). Remove both unless there's a real, current feature that uses them (double-check `apps/mobile/ios/ShareExtension` too, since it's manually maintained per `apps/mobile/CLAUDE.md`).

**Done:** `ios/Carrot/Info.plist` is gitignored and regenerated by `expo prebuild` on every EAS build, so hand-editing it wouldn't persist. Traced the actual source: `NSMicrophoneUsageDescription` is auto-injected by `expo-image-picker`'s config plugin (default text, since the plugin wasn't explicitly configured), and `NSFaceIDUsageDescription` by `expo-secure-store`'s config plugin — same situation. Fixed durably in `app.json`'s `plugins` array: `expo-secure-store` now passes `{ "faceIDPermission": false }` and `expo-image-picker` is explicitly listed with `{ "microphonePermission": false }`, so neither key is injected on the next prebuild/EAS build.

### 7. Sensitive allergen/dietary data — consider a disclaimer — ✅ Fixed

`SettingsScreen.tsx`'s `AllergenSection` stores predefined allergens, intolerances, and free-text custom tags used (per `docs/allergies.md`/recipe analysis) to flag recipes as unsafe. This is safety-relevant data: if AI-based recipe analysis misses an allergen, a user could rely on it and be harmed. This isn't a specific guideline violation today (no HealthKit, no medical claims), but:
- Guideline 1.4.1 is about apps *measuring* health metrics claiming clinical accuracy — you're not doing that, but any marketing copy claiming the allergen detection is complete/reliable would trigger it.
- Add a plain in-app disclaimer near the allergen settings (and in the privacy policy) that allergen/dietary flags are AI-assisted estimates, not a substitute for reading full ingredient labels — this is good practice regardless of App Review and reduces liability risk.

**Done:** added a footnote-style disclaimer ("Allergen flags are AI-assisted estimates, not a substitute for reading full ingredient labels.") directly under the household/personal scope label at the top of `AllergenSection` in `SettingsScreen.tsx`, in all 5 locales (`settings.allergenDisclaimer`). The privacy policy's "How we use your information" section was extended with the same caveat in all 5 locales.

### 8. Demo account for review notes

`apps/showcase/src/components/IosTestflightModal.tsx` already has demo credentials (`showcase@demo.com` / `showcase`) for testers. Guideline 2.1(a) requires a working demo account be provided in the App Store Connect **App Review notes** for any app with login. Before submitting:
- Confirm this account still logs in successfully against production and has a populated household/recipes so the reviewer doesn't land on an empty state.
- Paste the credentials into the "Notes for Review" field, and mention any non-obvious flows (e.g. import-by-URL, camera import) with specificity per 2.3.1 — don't leave it generic.

---

## Verify in App Store Connect (can't be checked from code)

- **App Privacy "nutrition label" questionnaire** — must match what's actually collected (see blocker #1 list). Don't let it default to "Data Not Collected."
- **Age rating questionnaire** (2.3.6) — answer honestly; recipe/allergen apps are typically 4+, but be accurate about UGC (custom allergen tags are free-text user input) and third-party ad/analytics answers.
- **Screenshots** (2.3.3, 2.3.9) — must show actual app screens in use (not just the splash/login screen), and must not contain real users' personal data — use the demo/fictional account's data.
- **Category** (2.3.5) — Food & Drink is the obvious fit; don't select Kids Category (guideline 1.3/5.1.4 add heavy restrictions that don't apply otherwise).
- **Copyright / marketing URL fields** — routine, just don't leave placeholders.

---

## Already compliant / no action needed

- **In-app purchases (3.1.x):** none exist — no premium tier, no paywall, so Guideline 3.1.1 doesn't apply yet. If a paid tier is ever added, it must go through StoreKit IAP, not an external payment link (outside the narrow US-storefront external-link entitlement).
- **Push notifications (4.5.4):** `expo-notifications` is used only for **local**, user-scheduled cooking-timer notifications (`TimerContext.tsx`) — no server push/APNs registration found. Not required for app function, no marketing use — compliant as-is.
- **HealthKit (5.1.3, 5.6):** not used anywhere — none of the HealthKit-specific restrictions apply.
- **App Tracking Transparency (5.1.2(i)):** no cross-app tracking SDK (Sentry is crash reporting only, no IDFA/ad tracking) — ATT prompt not currently required. Re-check if any ad/analytics SDK is added later.
- **Encryption export compliance:** `ITSAppUsesNonExemptEncryption: false` is declared in `app.json` — skips the export-compliance question on every build.
- **Privacy manifest file:** `ios/Carrot/PrivacyInfo.xcprivacy` exists and declares required-reason API usage (UserDefaults, FileTimestamp, SystemBootTime) with reason codes — this is the file Apple started enforcing at build-processing time; it's present and populated (though its `NSPrivacyCollectedDataTypes` is empty — fine, since that section is primarily about SDK-declared collection, not the host app's own data model covered by the privacy policy).
- **Self-contained bundle / minimum functionality (2.5.2, 4.2):** the app is a full native experience (native navigation, camera/photo import, household sharing, shopping lists, timers) — clearly beyond a repackaged website.
- **Login alternative to Google (4.8):** email/password exists and only requires an email — satisfies the "limited to name/email, no forced third-party tracking" requirement for the alternative login.
