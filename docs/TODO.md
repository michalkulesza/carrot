# TODO

Items are grouped by purpose and ordered from highest to lowest importance within each group. Completed items must remain at the very end of their category.

## Core product features

- [ ] **Round up fractional shopping-list quantities** — Display purchasable whole-item amounts while retaining the precise underlying quantity to prevent over-buying.
- [ ] **Multiple meals per day** — Support breakfast, lunch, dinner, and leftovers instead of a single recipe for each date.
- [ ] **Guided Cook Mode** — Full-screen, big-type, swipeable steps; keep the screen awake, surface timers from step text, and allow ingredient checkoff while cooking.
- [ ] **Visual recipe library / grid view** — Let users switch between the compact list and a photo-forward card or grid view with useful metadata such as tags, cooking time, and favourite status.
- [ ] **Cook from what I have / pantry** — Track pantry staples, rank recipes by missing ingredients, and subtract pantry items from the shopping list.
- [ ] **Calendar and reminder integration** — Send planned meals to the iOS Calendar and notify users when to start cooking or defrost ingredients.
- [x] **Ingredient scaling / adjust servings** — Released in 1.0.1 with serving-size steppers on web and iOS, live structured-ingredient recalculation, and scaled shopping-list additions.
- [x] **Useful Home screen** — Show tonight’s meal
- [x] **Move recipe add button** — Moved the mobile add action to a persistent orange glass button matching the Meal Plan “Today” control.

## Experience and product polish

- [ ] **Delightful empty and loading states** — Extend shimmers to recipe lists and meal plans; add friendly empty states, restrained Carrot mascot moments, import-stage animation, haptics, and completion feedback.
- [ ] **Haptics and native context menus** — Add meaningful haptic feedback and long-press recipe actions (favourite, plan, share, delete) with a peek preview.
- [ ] **Colours and themes** — Define and apply a cohesive theme system.
- [ ] **Review dark mode** — Fix automatic appearance detection and verify all screens in dark mode.
- [ ] **Simplify tags and allergens** — Remove custom tags and allergens if the predefined systems provide a clearer product experience.

## Quality, release, and growth

- [ ] **Double-verify recipe imports for hallucinations** — Add a second validation pass that compares imported ingredients, quantities, and instructions with the source before saving or presenting the recipe.
- [ ] **Automated tests** — Add meaningful coverage for core user flows and regressions.
- [ ] **Public sharing** — Create shareable public recipe pages.
- [ ] **Social tab and shareable recipes** — Add a discovery surface for recipes users choose to publish.
- [ ] **Premium lock** — Gate paid capabilities with a clear upgrade flow.

## Portfolio / showcase

- [ ] **Weekly meal-plan generator** — Auto-fill a week while honoring allergens, preferences, and variety, then generate its shopping list.
- [ ] **Semantic recipe search** — Use pgvector embeddings for natural-language queries such as “something warm and spicy for a cold night.”
- [ ] **Polished stats and insights dashboard** — Visualize cooking habits, favourite cuisines, streaks, and import history using the existing stats data.
- [ ] **Operational import dashboard** — Track pipeline latency, queue depth, cost, cache-hit rate, failures, retries, model usage, and per-job traces.
