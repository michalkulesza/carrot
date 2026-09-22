# Instagram fixture capture tool

This internal tool captures source payloads for `ExtractionOrchestrator` evaluation without changing Carrot production imports.

From the repository root, run one Instagram URL:

```powershell
& services/api/.venv/Scripts/python.exe tools/instagram-fixture-capture/capture_instagram_fixtures.py `
  "https://www.instagram.com/reel/SHORTCODE/" `
  --output-dir services/api/tests/captured-payloads
```

The tool opens Chrome at Instagram login using its own local profile. Log in, return to PowerShell, and press Enter. It captures the post, comments, and video; extracts audio with FFmpeg; and sends it to Gemini for transcription.

For a JSON URL array, including `production-recipe-source-urls.json`:

```powershell
& services/api/.venv/Scripts/python.exe tools/instagram-fixture-capture/capture_instagram_fixtures.py `
  --input-json production-recipe-source-urls.json `
  --output-dir services/api/tests/captured-payloads
```

To refresh only the non-Instagram HTML fixtures through Chrome, add `--html-only --overwrite`:

```powershell
& services/api/.venv/Scripts/python.exe tools/instagram-fixture-capture/capture_instagram_fixtures.py `
  --input-json tools/instagram-fixture-capture/production-recipe-source-urls.json `
  --html-only --overwrite `
  --output-dir services/api/tests/captured-payloads
```

Instagram URLs and all other HTTP(S) URLs are captured in Chrome. The resulting HTML envelope contains Chrome's post-JavaScript DOM, so dynamically rendered recipe content is retained for offline extraction tests.

For every batch, `failed-urls.json` is written in the output directory. It lists partial/failed captures and their errors while successful payloads remain in individual files.

Prerequisites: the API virtual environment, `ffmpeg` on `PATH`, and `GEMINI_API_KEY` in the root `.env`.
