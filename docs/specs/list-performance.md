# Recipe list performance: small thumbnails + FlashList

## Context
Browse scrolls choppily. Two structural causes:
1. List cards (100×100pt, 300px @3x) load full-size images. R2 "thumbnails" are the 1200px-wide hero image
   (`services/api/src/api/services/r2.py` `upload_image`), e.g. 1200×2133 / 208 KB; external thumbnails (131 of
   191 prod recipes) go through `/api/proxy/image` at full size. Every card downloads and decodes a large photo.
2. Browse uses `FlatList`, which mounts every card that enters the render window from scratch (no recycling).

## Contract between backend and mobile
- R2 small variant: same key with `_sm` before the extension:
  `thumbnails/<recipe>/<uuid>.jpg` → `thumbnails/<recipe>/<uuid>_sm.jpg`. Max 400px wide, keep aspect ratio,
  JPEG quality 80, `ContentType image/jpeg`. Full image unchanged (detail screen keeps using it).
- Proxy resize: `GET /api/proxy/image?url=<encoded>&w=<width>`; `w` is optional and only `400` is accepted
  (anything else → 422, so the endpoint can't be used to burn CPU with arbitrary sizes). Response is JPEG,
  resized to max that width (never upscaled), with a long-lived `Cache-Control` (`public, max-age=31536000`).
  Without `w` the endpoint behaves exactly as today.
- Mobile picks the small URL for list/shelf cards and falls back to the full URL if the small one fails, then to
  the placeholder as today.

## Backend (`services/api`)
- `r2.upload_image`: also upload the `_sm` variant from the same decoded image. `delete_image`: delete the `_sm`
  variant too (ignore if missing).
- `routes/proxy.py` `/image`: add the `w` parameter per the contract (Pillow, `pillow-heif` already registered
  where needed; keep all existing SSRF/size protections; resize in `asyncio.to_thread`).
- Backfill script `scripts/backfill_small_thumbnails.py` (pattern of `scripts/backfill_recipe_embeddings.py`):
  for every recipe whose `thumbnail_url` is an R2 URL, create the missing `_sm` object from the full image
  (HEAD first, skip if present). Batched, idempotent, `--dry-run`, prints counts. Not run in production as part of
  this change.
- Tests: `_sm` upload + delete (mock S3), proxy `w=400` resizes and sets cache header, invalid `w` rejected, no `w`
  unchanged.

## Mobile (`apps/mobile`)
- `src/api/thumbnailUrl.ts`: `smallThumbnailUrl(url)` per the contract (R2 → `_sm` key; external → proxy with
  `&w=400`; null → placeholder). `ThumbnailImage` gets a `size?: 'small' | 'full'` prop (default `'full'`) and on
  error steps small → full → placeholder. Browse `RecipeCard` and Home shelf cards use `size="small"`.
- Browse list → `@shopify/flash-list` v2 (`npx expo install @shopify/flash-list`): `getItemType` per list item type,
  drop `getItemLayout`/`buildItemLayouts`/window tuning props that FlashList doesn't use, keep
  `contentContainerStyle` padding (pills inset), `keyboardDismissMode`, `keyboardShouldPersistTaps`, the scroll-to-top
  ref (`FlashListRef`). Recycling safety: any per-item local state (marquee measurements, image load state) must
  reset when the item changes — give the marquee subtree `key={recipe.id}` and make `NetworkImage` derive its state
  from `uri` without a stale frame.
- `NetworkImage`: no shimmer/fade for images already in memory cache where expo-image reports it (or keep shimmer
  but skip `transition` when `cacheType` is `memory`).

## Verification
- `uv run pytest` in `services/api`; `npx tsc --noEmit` in `apps/mobile`.
- Release build on device: Browse with all recipes scrolls smoothly; images appear as small variants
  (check one in the network log); a recipe without `_sm` still shows its image (fallback).
