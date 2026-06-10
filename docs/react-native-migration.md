# React Native Migration Plan

Move PlateKeeper to Android + iOS via Expo, sharing business logic with the existing web app.

## Decisions made

| Topic | Decision |
|---|---|
| Auth — web | Keep existing HttpOnly cookie auth (safe with AdSense running) |
| Auth — mobile | Add JWT Bearer backend to FastAPI; store token in `expo-secure-store` |
| API base URL | `EXPO_PUBLIC_API_URL` env var in Expo |
| Shared package | Types + raw API functions + React Query hooks + pure utils + locales |
| UI library | `react-native-ui-lib` (Wix) |
| Navigation | React Navigation — bottom tabs |
| xlsx/PDF | Move generation to FastAPI backend; both web and mobile call an endpoint |
| v1 scope | Recipes, Meal Plan, Shopping List + PDF export, Settings |
| v2 scope | Recipe import (SSE rewrite), Timers (expo-notifications + expo-keep-awake) |

---

## Phase 1 — Extract `packages/shared`

Goal: move all platform-agnostic code out of `apps/web` into `packages/shared` so both web and mobile can import it. Web must continue working identically after this phase.

### 1.1 Initialise the package ✅

- Add `packages/shared/package.json` with name `@platekeeper/shared`, TypeScript build, proper `exports` map.
- Add `packages/shared/tsconfig.json`.
- Register the package in `pnpm-workspace.yaml` (already listed as `packages/*`).
- Add `@platekeeper/shared` as a workspace dependency in `apps/web/package.json`.

### 1.2 Move types ✅

Extract all TypeScript interfaces and types from `apps/web/src/api/client.ts` into `packages/shared/src/types.ts`:

- `Unit`, `UNITS`
- `Ingredient`, `StepRef`, `RecipeComponent`, `RecipeGroup`, `RecipeOut`, `RecipeSaveRequest`, `SaveComponent`
- `Tag`, `MealPlanEntry`, `UserPreferences`
- `AllergenData`, `AllergenFlag`
- `HouseholdOut`, `MemberOut`, `InvitationOut`
- `ImportResult`, `ImportMetadata`, `ImportStage`, `StageEvent`, `StreamCallbacks`
- `AuthUser`, `RegisterData`

### 1.3 Build a configurable API client ✅

The web uses relative URLs + cookies. Mobile needs absolute URLs + Bearer token. Create an API client factory:

```typescript
// packages/shared/src/api/client.ts
export interface ApiClientConfig {
  baseUrl: string                          // '' for web (relative), full URL for mobile
  getAuthHeaders: () => Record<string, string>  // {} for web (cookies), Bearer for mobile
  credentials?: RequestCredentials         // 'include' for web, 'omit' for mobile
}

export function createApiClient(config: ApiClientConfig) {
  // returns all API functions bound to this config
}
```

Move all API functions from `apps/web/src/api/client.ts` and `apps/web/src/api/auth.ts` into `packages/shared/src/api/` using this factory. Remove `EventSource`/`streamImport` from shared — it is v2 (mobile) and stays web-only for now.

`apps/web` initialises the client once:
```typescript
const api = createApiClient({ baseUrl: '', getAuthHeaders: () => ({}), credentials: 'include' })
```

### 1.4 Move React Query hooks

Create `packages/shared/src/hooks/` and extract query/mutation hooks from page components:

- `useRecipes` — list, create, update, delete, reorder, toggle favourite
- `useTags` — list, create, add/remove from recipe
- `useMealPlan` — list by month, set entry, delete entry
- `useShoppingList` — if any query hooks exist
- `usePreferences` — get, update
- `useHouseholds` — list, create, update, leave, switch
- `useInvitations` — list, accept, decline
- `useMembers`

Each hook accepts the API client instance (or reads it from a context).

### 1.5 Move pure utilities

Move to `packages/shared/src/utils/`:

- `apps/web/src/utils/tagUtils.ts` → `shared/src/utils/tagUtils.ts`
- Timer utilities from `TimerContext.tsx`: `parseDurationSeconds`, `parseDurationMatch`, `formatCountdown`, `formatDurationLabel` — these are pure functions with zero platform dependencies.

### 1.6 Move locales

Copy all 5 locale JSON files (`en`, `pl`, `de`, `fr`, `es`) to `packages/shared/src/locales/`. Move `i18n.ts` initialisation logic to a factory in `packages/shared/src/i18n.ts` so both apps can set it up with the same translations.

### 1.7 Update web imports + verify

- Update all `apps/web` imports to reference `@platekeeper/shared`.
- Run the web app and exercise every page — no regressions.

---

## Phase 2 — Move xlsx/PDF export to FastAPI

Goal: remove `exceljs` from the frontend; both web and mobile download a file from an API endpoint.

### 2.1 Add Python dependencies

Add to `services/api`:
- `openpyxl` — xlsx generation (port the meal plan grid from ExcelJS)
- `reportlab` or `weasyprint` — PDF generation

### 2.2 Add export endpoints

```
GET /api/export/meal-plan.xlsx?month=YYYY-MM   → returns .xlsx file
GET /api/export/meal-plan.pdf?month=YYYY-MM    → returns .pdf file
```

Both endpoints:
- Require auth (same cookie/JWT as other routes).
- Accept `month` query param (`YYYY-MM`).
- Fetch the user's meal plan entries for that month from the database.
- Generate the file server-side and stream it back with the correct `Content-Disposition` header.

The xlsx output should reproduce the current styled grid (header row, alternating row colours, fonts, borders) using `openpyxl`.

### 2.3 Update web MealPlanPage

Replace the client-side ExcelJS export function in `MealPlanPage.tsx` with a fetch to the new endpoint and a browser download trigger. Remove the `exceljs` import.

### 2.4 Remove exceljs

Remove `exceljs` from `apps/web/package.json` and run `pnpm install`.

### 2.5 Verify

Download xlsx and PDF from the web app — check formatting matches the current output.

---

## Phase 3 — Add JWT auth to FastAPI

Goal: mobile can authenticate with Bearer tokens while web continues using cookies untouched.

### 3.1 Add JWT bearer backend

Add a second `fastapi-users` auth backend using `JWTStrategy` alongside the existing cookie backend. Expose:

```
POST /api/auth/jwt/login    → returns { access_token, token_type }
POST /api/auth/jwt/logout   → (optional, client just discards the token)
```

Keep the existing `/api/auth/cookie/login` endpoint intact.

### 3.2 Protect routes with both backends

Configure `fastapi-users` so that routes accept either a valid cookie **or** a valid Bearer token. No change to existing web behaviour.

### 3.3 Verify

Test the JWT endpoint directly (curl or Postman) — confirm it returns a token and that the token grants access to `/api/users/me`.

---

## Phase 4 — Scaffold the Expo app

Goal: a working shell app that can authenticate, navigate between tabs, and call the API.

### 4.1 Create `apps/mobile`

```
pnpm create expo-app apps/mobile --template blank-typescript
```

Configure `pnpm-workspace.yaml` if needed so the mobile app is part of the monorepo.

### 4.2 Install dependencies

```
react-native-ui-lib
@react-navigation/native
@react-navigation/bottom-tabs
react-native-screens
react-native-safe-area-context
@tanstack/react-query
react-i18next i18next
expo-secure-store
expo-constants
@platekeeper/shared (workspace)
```

### 4.3 Configure environment

Add `EXPO_PUBLIC_API_URL` to `apps/mobile/.env` (local dev points to the running FastAPI, e.g. `http://10.0.2.2:8000` for Android emulator).

### 4.4 Wire up providers

In `apps/mobile/src/App.tsx`:
- `QueryClientProvider`
- `I18nextProvider` (using shared locale factory)
- `AuthProvider` (mobile flavour — stores JWT in `expo-secure-store`)
- `NavigationContainer`

### 4.5 Build navigation skeleton

Bottom tab navigator with 4 tabs:
- Recipes
- Meal Plan
- Shopping List
- Settings

Plus a separate Auth stack (Login, Register) shown when unauthenticated.

### 4.6 Initialise the shared API client

```typescript
const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  getAuthHeaders: () => {
    const token = getStoredToken() // from expo-secure-store (sync cache)
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  credentials: 'omit',
})
```

Expose via React context so all shared hooks can call it.

---

## Phase 5 — Build v1 mobile screens

Each screen uses `react-native-ui-lib` components and the shared React Query hooks from `@platekeeper/shared`.

### 5.1 Auth screens
- **LoginScreen** — email + password form, calls `/api/auth/jwt/login`, stores token in `expo-secure-store`.
- **RegisterScreen** — same flow with register then auto-login.

### 5.2 Recipes tab
- **RecipesScreen** — list of recipes (search + tag filter). Tap opens detail.
- **RecipeDetailScreen** — full recipe view: ingredients, steps, notes, tags. Read-only for v1; add/edit in a later iteration.

### 5.3 Meal Plan tab
- **MealPlanScreen** — month calendar with recipe dots, week list below. Tap a day to assign/remove a recipe.

### 5.4 Shopping List tab
- **ShoppingListScreen** — aggregated ingredient list. PDF export button → calls `/api/export/meal-plan.pdf`, opens in native share sheet via `expo-sharing`.

### 5.5 Settings tab
- **SettingsScreen** — language picker, unit system toggle (metric/imperial), week start day. Writes to `/api/preferences`.

---

## Phase 6 — v2 features (after v1 ships)

### 6.1 Recipe import (SSE)

`EventSource` does not exist in React Native. Options:
- Use a fetch-based SSE reader (`@microsoft/fetch-event-source` or manual `ReadableStream` parsing).
- Or add a polling fallback endpoint on the backend.

Implement `streamImport` in a mobile-compatible way and add an ImportScreen.

### 6.2 Timers

Mobile timers are simpler than web — no service worker needed.

- `expo-notifications` — schedule a local notification at `now + duration`; OS delivers it even if the app is killed.
- `expo-keep-awake` — keep screen on while a timer is running (replaces Wake Lock).
- `AsyncStorage` — persist paused timer state across app restarts.
- The timer countdown display is a plain `setInterval` in the component.

Pure timer utilities (`parseDurationSeconds`, `formatCountdown`, etc.) are already in `@platekeeper/shared` from Phase 1.

### 6.3 Remaining feature parity

- Recipe add/edit from mobile
- Household management (invite, switch, leave)
- Allergen settings
- Notification history (bell)
- Drag-to-reorder recipes (react-native-reanimated)

---

## Monorepo structure after migration

```
platekeeper/
  apps/
    web/          Vite + React — unchanged externally; imports from @platekeeper/shared
    mobile/       Expo — React Navigation + react-native-ui-lib
  packages/
    shared/       Types + API client factory + React Query hooks + utils + locales
  services/
    api/          FastAPI — gains JWT backend + export endpoints
```
