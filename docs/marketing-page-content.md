# Carrot — Marketing Page Content Plan

Content and structure plan for the Carrot marketing page (the `apps/showcase` site).
Ordered by conversion priority: the hero sells the one killer feature, the sections
below it answer "what else do I get" in descending order of wow-factor.

---

## Positioning

**Who it's for:** people who save recipes from everywhere (Instagram, TikTok, food blogs)
and cook at home — especially couples/families who plan meals together.

**One-liner:** Carrot turns any link into a clean, cookable recipe — and keeps your whole
household's cooking in sync.

**Why we win:** most recipe apps are either a dumb bookmark folder or a manual data-entry
chore. Carrot's AI import (including video/social transcription) removes the entry work,
and households + live sync remove the "screenshot it to your partner" workflow.

---

## Hero

**Headline:** `Any recipe. One link away.`
Alternative: `Paste a link. Get a recipe.`

**Subheadline:** Import recipes from any website or social video — Carrot's AI extracts
the ingredients, steps, and nutrition into a clean recipe you can actually cook from.
Solo or with your whole household, always in sync.

**Primary CTA:** `Start cooking — it's free` (web app)
**Secondary:** a low-key text link `Also on iOS (beta)` — no TestFlight modal in the
hero; the full iOS install flow lives in the closing section until App Store release.

**Hero visual:** a paste-a-link animation — a social/blog URL dropping into the import
field, morphing into a finished recipe card (title, photo, ingredients, nutrition chips).
This is the single most demoable moment in the product; show it, don't describe it.

**Trust line under CTAs:** `Free · Web + iOS · English, Polski, Deutsch, Français, Español`

---

## Feature sections (in order)

### 1. AI recipe import — the flagship
> **Save recipes from anywhere — even videos.**
> Paste a link from any food blog or social video. Carrot reads the page — or listens
> to the video — and builds a structured recipe: ingredients, steps, servings, time,
> and nutrition. Imports run in the background; you keep browsing.

- Show: the share-sheet flow on iOS (share from a social app → recipe appears in Carrot).
- Platform icons (Instagram, TikTok, generic browser/blog) shown as a small logo row in
  this section — icons communicate the platforms without naming them in copy.
- Mention: works with the messy real web (blogs, video captions, multi-part recipes).

### 2. Cook mode — the "actually cooking" feature
> **A kitchen-proof cooking view.**
> Step-by-step guided mode with big type, ingredient checklists, inline timers, and a
> screen that stays awake. Swipe through steps with messy hands; your progress is saved
> if you get interrupted.

- Show: phone propped in a kitchen, one large step on screen with a running timer chip.
- This is the section that proves Carrot is a cooking tool, not a bookmarking tool.

### 3. Households & live sync — the differentiator
> **Cook together, plan together.**
> Share a recipe library and meal plan with your household. When your partner adds
> Thursday's dinner, you see it instantly — no refresh, no screenshots, no group chat.

- Show: two devices side by side, a meal-plan edit on one appearing live on the other.
- Mention: personal library stays personal; you choose what's shared.

### 4. Smart scaling & units
> **2 servings or 12 — the math is done.**
> Change the serving count and every quantity recalculates live, with metric and
> imperial side by side ("300 ml chicken broth (1 cup)"). Your preferred units,
> everywhere.

- Show: serving stepper animating quantities.

### 5. Meal planning
> **Know what's for dinner.**
> A calendar for your week: drop in recipes or quick entries like "frozen pizza night."
> Export or print the plan. The next meal is always one glance away.

### 6. Search that gets it
> **Find "something cozy with chicken."**
> Semantic search finds recipes by meaning, not just matching words — plus classic
> title/ingredient search, tags, favourites, and filters by protein, cuisine, or time.

### 7. Allergy-aware
> **Cooks around your allergies.**
> Tell Carrot what to avoid. Imported recipes get allergen warnings, and one tap
> substitutes the ingredient — with quantities adjusted.

- Keep the tone careful: "AI-assisted flags, always read labels" (matches privacy policy).

### 8. Sharing
> **Send a recipe to anyone.**
> Share any recipe with a public link. Friends can view it instantly — and add it to
> their own Carrot library with one tap.

---

## Supporting strip (small icons row, no big sections)

- **Timers that survive** — step timers keep running through reloads and notify you.
- **Private notes** — per-recipe notes only you see.
- **Your data, portable** — CSV export/import; delete everything anytime.
- **5 languages** — EN, PL, DE, FR, ES.
- **Dark mode** — native, automatic.
- **Native iOS app** — real native feel, haptics, share extension.

---

## Closing section

**Headline:** `Your recipes, finally in one place.`
**CTA:** primary web CTA repeated, plus the iOS card here (TestFlight modal lives in
this section, framed as "iOS beta — join via TestFlight") and the Android
"coming soon" note.
Footer keeps existing Privacy Policy / Support links.

---

## What to show (asset checklist)

1. Hero: link-to-recipe import animation (screen recording → looped video/GIF).
2. Cook mode on iPhone, mid-recipe with a timer running (dark mode looks best here).
3. Two-device live-sync clip for households.
4. Serving stepper scaling clip.
5. Meal plan calendar (desktop web screenshot — shows the product isn't mobile-only).
6. Semantic search query + results screenshot.
7. Allergen warning + one-tap substitution screenshot.

All device shots in both light and dark where cheap to produce; prefer real recipe
content (actual photos, real ingredient lists) over lorem-ipsum recipes.

---

## Decisions

1. **iOS CTA:** downplayed for now — a small `Also on iOS (beta)` text link in the hero;
   the TestFlight modal moves to the closing section. Promote to a full hero CTA at
   App Store release.
2. **Audience framing:** both, with a hierarchy — headline stays universal (the import
   hook), the subheadline carries the household angle in its closing clause, and
   households remain the big section 3.
3. **Pricing:** yes — "free" appears in the primary CTA and trust line.
4. **Social import claims:** copy says "social video" / "social & video links"; the
   actual platforms are communicated with a small icon row in the import section
   instead of naming them in text.
5. **Localization:** all 5 locales (EN, PL, DE, FR, ES) written from day one.
