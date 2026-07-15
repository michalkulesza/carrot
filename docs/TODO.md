# TODO

Items are grouped by purpose and ordered from highest to lowest importance within each group. Completed items must remain at the very end of their category.

## Core product features

- [ ] **Make sure sharing work on physical device**
- [ ] **Fix recipe share options in household context** — On recipe details, the share button is wrong in household context: it should also allow sending the recipe to my personal library, and it should hide "send to household" when the household already contains that recipe.
- [ ] **Unified ingredient list with collapsible groups** — When a recipe has multiple ingredient groups (e.g. Main and Sauce), show one combined "Ingredients" list of everything at the top, then render each group as its own collapsible section that is collapsed by default, with a caret/chevron at the end of each group header.
- [ ] **Guided Cook Mode** — Full-screen, big-type, swipeable steps; keep the screen awake, surface timers from step text, and allow ingredient checkoff while cooking.
- [ ] **Visual recipe library / grid view** — Let users switch between the compact list and a photo-forward card or grid view with useful metadata such as tags, cooking time, and favourite status.

- [ ] **Round up fractional shopping-list quantities** — Display purchasable whole-item amounts while retaining the precise underlying quantity to prevent over-buying.
- [ ] **Multiple meals per day** — Support breakfast, lunch, dinner, and leftovers instead of a single recipe for each date.
- [ ] **Cook from what I have / pantry** — Track pantry staples, rank recipes by missing ingredients, and subtract pantry items from the shopping list.
- [ ] **Calendar and reminder integration** — Send planned meals to the iOS Calendar and notify users when to start cooking or defrost ingredients.
- [ ] **Analyze ingrdients prompt** - Cache + merge into enrichement one??? Is it reliable, doesnt it make up things
- [ ] **Personal-only recipe filter** — Add a filter to show only recipes in my personal library that don't belong to any household.
- [x] **When importing recipe send it to the background straight away** - inseatead of waiting at the skeleton screen, drop it in the bg, and show placeholder, redirect to recipe page
- [x] **Ingredient scaling / adjust servings** — Released in 1.0.1 with serving-size steppers on web and iOS, live structured-ingredient recalculation, and scaled shopping-list additions.
- [x] **Useful Home screen** — Show tonight’s meal
- [x] **Move recipe add button** — Moved the mobile add action to a persistent orange glass button matching the Meal Plan “Today” control.
- [x] **Don't attach ingredients to the final assembly step** — When mapping ingredients to recipe steps, skip the last/final assembly step so ingredients aren't duplicated onto it.
- [x] **Cooking time estimation** — Estimate each recipe's cooking time and show it in the stat boxes, in the far-left box.
- [x] **Improve prompts** — Refined recipe-import query boundaries: source-only extraction schema, enrichment-only schema with a validated combiner, deduplicated allergen analysis, and honoured per-import model overrides. See docs/specs/refine-recipe-import-queries.md.
- [x] **Quick plain-text meal entries** — Add a one-per-day free-text meal alongside recipes, shared within the active personal or household plan.
- [x] **RE RUN PRODUCTION** recipes

## Experience and product polish

- [ ] **Extraction failed screen** - Improve that visually
- [ ] **Review dark mode** — Fix automatic appearance detection and verify all screens in dark mode.
- [ ] **Simplify tags and allergens** — Remove custom tags and allergens if the predefined systems provide a clearer product experience.
- [ ] **Haptics and native context menus** — Add meaningful haptic feedback and long-press recipe actions (favourite, plan, share, delete) with a peek preview.
- [ ] **Delightful empty and loading states** — Extend shimmers to recipe lists and meal plans; add friendly empty states, restrained Carrot mascot moments, import-stage animation, haptics, and completion feedback.
- [ ] **Colours and themes** — Define and apply a cohesive theme system.
- [x] **When loading from an empty state** — Wait for authentication before loading recipes and the next planned meal, rather than showing an unauthenticated error.
- [x] **Correct household recipe contributor avatars** — Show the actual contributor alongside the household avatar when the recipe is also in a personal library.
- [x] **Respect the safe area in meal-plan search** — Bound the picker drawer’s keyboard-expanded range to the device safe area.
- [x] **Use native-style meal-plan search** — Match the picker drawer’s search field to the rounded, borderless recipe-library search bar.

## Quality, release, and growth

- [ ] **Automated tests** — Add meaningful coverage for core user flows and regressions.
- [ ] **Premium lock** — Gate paid capabilities with a clear upgrade flow.
- [ ] **Public sharing** — Create shareable public recipe pages.
- [ ] **Social tab and shareable recipes** — Add a discovery surface for recipes users choose to publish.
- [x] **Reduce extraction hallucinations (prompt/model tuning)** — Cheap first lever before a full validation pass: add an anti-fabrication clause to the extraction prompt, set `temperature=0`, and route the faithful-extraction call to `gemini-2.5-flash` (keeping shopping-list/unit-conversion on `flash-lite`). See `docs/specs/reduce-extraction-hallucinations.md`.

## Portfolio / showcase

- [ ] **Semantic recipe search** — Use pgvector embeddings for natural-language queries such as “something warm and spicy for a cold night.”
- [ ] **Weekly meal-plan generator** — Auto-fill a week while honoring allergens, preferences, and variety, then generate its shopping list.
- [ ] **Polished stats and insights dashboard** — Visualize cooking habits, favourite cuisines, streaks, and import history using the existing stats data.
- [ ] **Operational import dashboard** — Track pipeline latency, queue depth, cost, cache-hit rate, failures, retries, model usage, and per-job traces.
