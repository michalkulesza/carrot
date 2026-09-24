# TODO

Open work only. When an item is completed, move it to the matching category in [TODO-COMPLETED.md](TODO-COMPLETED.md).

## Most urgent

- [ ] **Extraction critical-field monitoring** — Send a Sentry info event when a completed recipe extraction lacks source-provided total time, servings, calories, protein, fat, or carbohydrates. Include only safe diagnostic metadata such as missing field names, source kind, and sanitized source URL; never include recipe text or user-provided content.

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
- [ ] **Make the allergen pass opt-in** — Skip the allergen Gemini call entirely while a user has no allergens set. Enable it the moment the first allergen is added in settings, and backfill existing recipes with an allergens-only pass (no re-extraction, no re-enrichment). Show an in-app progress message while the backfill runs and send a notification when it finishes.

## Experience and product polish

- [ ] **Web recipe details looks not great** !!!!!!!
- [ ] **iOS Universal Links for recipe URLs** — Configure the Associated Domains entitlement and `apple-app-site-association` hosting so supported Carrot web recipe links can open the native app, with authenticated scope handling and browser fallback.
- [ ] **Delightful empty and loading states** — Extend shimmers to recipe lists and meal plans; add friendly empty states, restrained Carrot mascot moments, import-stage animation, haptics, and completion feedback.

- [ ] **Colours and themes** — Define and apply a cohesive theme system.

## Quality, release, and growth

- [ ] **Verify rendered HTML imports after deployment** — Run a production import of a JavaScript-created recipe card and confirm title, ingredients, steps, servings, total time, available nutrition, source evidence, and renderer diagnostics. Check the renderer health and import trace.
- [ ] **Automated tests** — Add meaningful coverage for core user flows and regressions.
- [ ] **Premium lock** — Gate paid capabilities with a clear upgrade flow.
- [ ] **Social tab and shareable recipes** — Add a discovery surface for recipes users choose to publish.

## Portfolio / showcase

- [ ] **Weekly meal-plan generator** — Auto-fill a week while honoring allergens, preferences, and variety, then generate its shopping list. Specify the week as craving quotas (Chicken ×2, Pasta ×2, Asian ×1) plus an optional free-text wish; a deterministic solver proposes a week from the library with per-day lock/reroll and an honest coverage bar. Blocked on [household v2](specs/completed/household-v2.md). See [the plan](specs/completed/weekly-meal-plan-generator.md).
- [ ] **Polished stats and insights dashboard** — Visualize cooking habits, favourite cuisines, streaks, and import history using the existing stats data.
- [ ] **Operational import dashboard** — Track pipeline latency, queue depth, cost, cache-hit rate, failures, retries, model usage, and per-job traces.
