# TODO

Open work only. When an item is completed, move it to the matching category in [TODO-COMPLETED.md](TODO-COMPLETED.md).

## Most urgent

- [ ] **Extractor v2** — Core extraction and production integration are complete. Add 25 reviewed TikTok fixtures (five each in en, pl, de, fr, es); Facebook support is tracked separately under Core product features. The extractor stays source-agnostic, accepting cleaned HTML or normalized text. Plan: [Extractor v2](specs/extractor-v2.md).

## Core product features

- [ ] **Visual recipe library / grid view** — Let users switch between the compact list and a photo-forward card or grid view with useful metadata such as tags, cooking time, and favourite status.

- [ ] **Multiple meals per day** — Support breakfast, lunch, dinner, and leftovers instead of a single recipe for each date.
- [ ] **Round up fractional shopping-list quantities** — Display purchasable whole-item amounts while retaining the precise underlying quantity to prevent over-buying.
- [ ] **Cook from what I have / pantry** — Track pantry staples, rank recipes by missing ingredients, and subtract pantry items from the shopping list.
- [ ] **Web recipe import source icons** — Add icons for supported sources beneath the import method buttons.
- [ ] **Threads, YouTube, Facebook, and Pinterest recipe imports** — Support recipe URLs from these platforms through source-specific acquisition adapters feeding extractor v2. Preserve source provenance and apply the existing safe-fetch and fallback rules. Keep this work separate from the extractor-v2 release.
- [ ] Support Threads posts, including post text, media, and linked recipe pages where available.
- [ ] Support YouTube videos and Shorts, including descriptions, captions or transcripts, and linked recipe pages where available.
- [ ] **Facebook and Facebook short-video imports** — Support Facebook post, Reel/short-video, and `fb.watch` URLs through a Facebook-specific acquisition adapter. Capture the description, creator identity, verified creator-authored comments, linked recipe pages, and video/audio evidence where available; pass a versioned payload to the extraction-v2 orchestrator.
- [ ] Add reviewed Facebook extraction-v2 fixtures: five recipes for each of English, Polish, German, French, and Spanish (25 fixtures total), plus end-to-end import tests before enabling the source.
- [ ] Support Pinterest pins, including pin text, images, and linked recipe pages where available.
- [ ] **Multi-page photo import** — The Import Recipe design lets users add up to 5 photos and combine them into one recipe. The import API (`kind: "image"`) accepts a single `image_base64`, so the web import modal currently takes one photo. Extend the job input and extractor to accept several pages, then add the numbered page grid with "Add page" and remove buttons.
- [ ] **Make the allergen pass opt-in** — Skip the allergen Gemini call entirely while a user has no allergens set. Enable it the moment the first allergen is added in settings, and backfill existing recipes with an allergens-only pass (no re-extraction, no re-enrichment). Show an in-app progress message while the backfill runs and send a notification when it finishes.

## Experience and product polish

- [ ] **Web recipe details looks not great** !!!!!!!
  - [ ] Match mobile recipe editing: add and remove ingredients and steps, edit component names and shopping categories, and add a photo when none exists.
  - [ ] Let users change a recipe's household memberships from web recipe detail.
  - [ ] Let users edit a single ingredient before adding it to the shopping list from web recipe detail.
  - [ ] Add cook-mode text size controls and a recipe bug-report action on web.
  - [ ] Revisit the new recipe popup's step cards once ingredients can be assigned to steps (if feasible): show the "uses" ingredient chips under each step, as in the Recipe Popup Final design.
  - [ ] Show a way to set a base serving count for recipes imported without one before offering ingredient scaling on web and mobile.
- [ ] **iOS Universal Links for recipe URLs** — Configure the Associated Domains entitlement and `apple-app-site-association` hosting so supported Carrot web recipe links can open the native app, with authenticated scope handling and browser fallback.

## Quality, release, and growth

- [ ] **Verify rendered HTML imports after deployment** — Run a production import of a JavaScript-created recipe card and confirm title, ingredients, steps, servings, total time, available nutrition, source evidence, and renderer diagnostics. Check the renderer health and import trace.
- [ ] **Premium lock** — Gate paid capabilities with a clear upgrade flow.
- [ ] **Social tab and shareable recipes** — Add a discovery surface for recipes users choose to publish.
- [ ] **Weekly meal-plan generator** — Auto-fill a week while honoring allergens, preferences, and variety, then generate its shopping list. Specify the week as craving quotas (Chicken ×2, Pasta ×2, Asian ×1) plus an optional free-text wish; a deterministic solver proposes a week from the library with per-day lock/reroll and an honest coverage bar. Blocked on [household v2](specs/completed/household-v2.md). See [the plan](specs/completed/weekly-meal-plan-generator.md).
- [ ] **Polished stats and insights dashboard** — Visualize cooking habits, favourite cuisines, streaks, and import history using the existing stats data.
- [ ] **Operational import dashboard** — Track pipeline latency, queue depth, cost, cache-hit rate, failures, retries, model usage, and per-job traces.
