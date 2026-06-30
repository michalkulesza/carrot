# R2 Image Storage Plan

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Upload path | Client → API → R2 (API handles R2 upload) |
| 2 | Import thumbnails | Copy external thumbnail to R2 at import time |
| 3 | Existing recipes | Leave as-is (migrate naturally on edit) |
| 4 | File naming | `thumbnails/{recipe_id}/{uuid}.jpg` |
| 5 | Image processing | Resize to 1200px wide, JPEG 85% (Pillow) |
| 6 | Web app | File picker on web too |
| 7 | CDN domain | `R2_PUBLIC_URL` env var (default Cloudflare R2 domain) |
| 8 | Delete old object | Yes — delete old R2 object when thumbnail is replaced |

Placeholder: `platekeeper-images` bucket → `catering-item-placeholder-704x520.png`

---

## Backend (`services/api`)

### 1. `config.py` — add R2 settings
```python
r2_endpoint_url: str = ""
r2_access_key_id: str = ""
r2_secret_access_key: str = ""
r2_bucket_name: str = ""
r2_public_url: str = ""  # e.g. https://pub-<hash>.r2.dev

@property
def r2_configured(self) -> bool:
    return bool(self.r2_endpoint_url and self.r2_access_key_id and self.r2_bucket_name)
```

### 2. `services/r2.py` — new module
- `upload_image(data: bytes, recipe_id: str) -> str`
  - Resize with Pillow: cap width at 1200px, convert to JPEG at 85% quality
  - Key: `thumbnails/{recipe_id}/{uuid4()}.jpg`
  - Upload via `boto3` S3 client pointing at R2 endpoint
  - Return `{R2_PUBLIC_URL}/thumbnails/{recipe_id}/{uuid}.jpg`
- `delete_image(url: str) -> None`
  - Extract key from URL (strip `R2_PUBLIC_URL` prefix)
  - Delete object from bucket; no-op if URL is not an R2 URL

### 3. `routes/images.py` — new route file
- `POST /api/images/thumbnail?recipe_id={id}`
  - Auth required (`current_active_user`)
  - Accepts `multipart/form-data` with `file` field
  - Calls `r2.upload_image(await file.read(), recipe_id)`
  - Returns `{ "url": "<cdn url>" }`
  - Returns 503 if R2 not configured

### 4. `routes/recipes.py` — update on thumbnail change
- In `PUT /recipes/{id}`: if `recipe.thumbnail_url` is an R2 URL and `body.thumbnail_url` differs → call `r2.delete_image(old_url)` before saving

### 5. Import pipeline
- In `services/import_worker.py` (or `services/pipeline.py`): after `thumbnail_url` is extracted from scraper, if it's an external URL → download bytes → call `r2.upload_image(bytes, recipe_id)` → store R2 URL instead
- Fire-and-forget with try/except (failure keeps original URL)

### 6. `pyproject.toml`
Add: `boto3`, `Pillow`

---

## Mobile (`apps/mobile`)

### `src/api/thumbnailUrl.ts`
- Add `PLACEHOLDER_URL` constant pointing to R2 placeholder image
- Add `isR2Url(url: string) -> boolean` helper

### `src/screens/EditRecipeScreen.tsx`
Replace thumbnail `TextInput` with:
- Thumbnail preview (`Image`) when URL is set
- "Change photo" / "Add photo" `Pressable` button
- On press: `ImagePicker.launchImageLibraryAsync()` → POST to `/api/images/thumbnail?recipe_id={id}` → set `state.thumbnail_url` to returned URL
- Remove `isValidImageUrl` check on save (URL always comes from R2 now)
- Show upload progress indicator while uploading

### `src/screens/RecipesScreen.tsx`
- Use `defaultSource` or `onError` on recipe card `Image` → fall back to `PLACEHOLDER_URL`

### `src/screens/RecipeDetailScreen.tsx`
- Hero `Image`: `defaultSource={{ uri: PLACEHOLDER_URL }}` + `onError` fallback

---

## Web (`apps/web`)

### `src/utils/imageUtils.ts`
- Add `PLACEHOLDER_URL` constant

### `src/api/client.ts`
- Add `uploadThumbnail(file: File, recipeId: string): Promise<{ url: string }>`

### `src/components/AddRecipeModal.tsx`
- Replace thumbnail URL `<input type="text">` with `<input type="file" accept="image/*">` + preview
- On file select → call `api.uploadThumbnail(file, recipeId)` → store URL

### `src/components/RecipeDetailModal.tsx`
- Same as above in edit mode
- In view mode: show `<img>` with `onError` fallback to `PLACEHOLDER_URL`

---

## Environment variables to add

```env
R2_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=platekeeper-images
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

Add to `compose.yml` and `compose.prod.yml` under the `api` service.

---

## What is NOT changing
- `thumbnail_url` column type stays `string | null` — no DB migration
- Proxy route (`/api/proxy/image`) stays — still needed for legacy external URLs
- Existing recipes are left with their current URLs
- Shared types package (`packages/shared/src/types.ts`) unchanged
