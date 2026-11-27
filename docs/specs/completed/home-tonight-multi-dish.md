# Home "Tonight" card — several dishes per day (Main + side rows)

Source design: "Mobile - Home Screen" → "Tonight with several dishes — Main + side rows"
(https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a#artboard-d7fe07c3ec20).

## Goal
The mobile Home "Tonight" card shows only the first meal-plan entry of the next planned day.
When that day has several entries, the first (earliest `created_at`) stays the photo hero card and
every other entry of the same day hangs below it as a compact row, each with its own Cook button.
A single-dish day renders exactly as today, except the button is "Cook".

## Backend (`services/api/src/api/routes/meal_plan.py`)
- New route `GET /meal-plan/next-day?from=YYYY-MM-DD` → `list[MealPlanEntryOut]`: all household
  entries on the earliest date `>= from`, ordered by `_entry_order()`. Empty list when nothing upcoming.
  Declare it next to `/next` (before any `/{date_str}` route).
- Keep `/meal-plan/next` unchanged — shipped mobile builds and the web `NextMealCard` still use it.
- Tests in `services/api/tests/test_meal_plan.py`, following the existing `/next` test style.

## Shared (`packages/shared`)
- `api/client.ts`: `getNextMealPlanDay(from): Promise<MealPlanEntry[]>`, exported with the others.
- New hook `hooks/useNextMealPlanDay.ts` mirroring `useNextMealPlanEntry` (midnight rollover,
  `useMealPlanStream`), query key `['mealPlan', 'nextDay', todayIso]` so existing `['mealPlan']`
  invalidations refresh it. Returns `{ entries, todayIso, isLoading, error, refetch }`.
  Add to package.json exports if hooks are listed there individually.

## Mobile (`apps/mobile/src/screens/HomeScreen`)
- `TonightCard.tsx` uses `useNextMealPlanDay`; state `entry` when `entries.length > 0`.
- Hero (first entry): unchanged look. Kicker = `getTonightKicker(...)` (e.g. "Tonight · 25 min");
  when there are 2+ dishes, insert the course label: "Tonight · Main · 25 min".
  Button: label `t('home.cook')`, SF Symbol `play.fill` if `Button` supports an icon, navigates to
  `/recipe/[id]/cook`. Tapping the card still opens `/recipe/[id]`. Text-only entries: no button,
  card tap opens the meal plan (current behaviour).
- Rows container: the hero and rows share one rounded card surface (radius 20, secondary
  background); rows sit below the 130pt photo with 14pt horizontal padding, 2pt top / 4pt bottom.
- Side row (`TonightDishRow.tsx`, new file): 44×44 thumbnail (radius 12, `ThumbnailImage`; placeholder
  when no photo), gap 12, padding 10 vertical; text column: kicker (Caption 1 12pt, bold, uppercase,
  letterSpacing, action/accent text tone) + title (Callout 16pt semibold, 1 line ellipsis); trailing small
  "Cook" button (play icon) on a white/systemBackground pill, height ~34. Hairline separator between
  rows (`separator`), none after the last. Row tap → `/recipe/[id]`; Cook → `/recipe/[id]/cook`.
  Text-only entry rows: no thumbnail image (placeholder), no Cook; tap opens meal plan.
- Course label per dish: `Dessert` if the recipe has a `meal`-category tag named "Dessert",
  otherwise `Side` for non-first dishes and `Main` for the first. Row kicker = "Side · 20 min".
- Accessibility labels on hero, each row and each Cook button ("Cook {{title}}").
- Taps are guarded against rapid repeats like the existing handlers.

## Translations
New keys in all 7 locales (en, pl, de, fr, es, it, pt): `home.cook`, `home.cookTitle`
("Cook {{title}}"), `home.courseMain`, `home.courseSide`, `home.courseDessert`.
Remove `home.open` only if nothing else uses it.

## Out of scope
Web `NextMealCard`, meal-plan screen, course data model.

# Home "Timers" row (collapsed like Imports)

Source design: "Mobile - Home Screen" → "Home — current design" (Timers row) and
"Running timers — collapsed like Imports".

## Goal
Timers started from a recipe or cook mode show on Home as one collapsible card directly under the
Imports card. It is hidden when no timers exist.

## Data
`useTimers()` from `apps/mobile/src/context/TimerContext` (`timers`, `pauseTimer`, `resumeTimer`,
`cancelTimer`, `getRemainingSeconds`, `formatCountdown`, `getTimerDestination`). No new storage.
Order: running/paused by remaining time ascending, done timers first. Re-render every second only
while the card has a running timer (one interval, cleared when none run).

## Collapsed header (one Pressable row, same anatomy as the Imports summary row)
- Leading 36pt circle (white/systemBackground) with a 3pt progress ring for the head timer
  (next to finish) and the timer count in its centre (15pt bold). Ring: label colour running,
  grey paused, accent/orange done; a gentle pulse when any timer is done (respect reduced motion).
  Use react-native-svg if it's already a dependency, otherwise ask before adding one.
- Title `t('home.timers.title')` ("Timers"); subtitle summary "Sauce 0:42 · Rice 11:58" in tabular
  numbers, 1 line ellipsis; secondary colour, accent colour when any timer is done.
- Trailing chevron rotating 180° when expanded. `accessibilityState={{ expanded }}`.

## Expanded list (hairline divider under the header, rows separated like Imports rows)
Each row: label (Callout semibold, 1 line) and countdown right-aligned (bold, tabular, "Done" when
finished, grey when paused, accent when done); a 4pt progress bar below (same colours); recipe title as
a footnote/caption line. Trailing: 36pt round pause/play button (`pause.fill` / `play.fill`,
labels "Pause {{label}}" / "Resume {{label}}") for not-done timers, or an accent "Dismiss" pill for
done timers (calls `cancelTimer`). Row tap navigates to `getTimerDestination(timer)` (match how
other places open a timer, e.g. notification handling / `withNavigationNonce`).
Timer label: reuse whatever short label the app already shows for a timer (TimerChip / Live
Activity); otherwise the duration label.

## Files
New `HomeScreen/TimersCard.tsx` (+ `TimerRow.tsx` if it helps), wired into `HomeScreen/index.tsx`
right after the Imports card. Reuse ImportsCard's expand/collapse building blocks where possible,
extracting a shared component instead of duplicating if they're near-identical.

## Translations (all 7 locales)
`home.timers.title`, `home.timers.done`, `home.timers.pause`, `home.timers.resume`,
`home.timers.dismiss`, plus any summary/accessibility strings needed.
