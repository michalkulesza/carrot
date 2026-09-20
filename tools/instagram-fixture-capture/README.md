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

Instagram URLs are captured in a browser. Other HTTP(S) URLs, whether passed directly, in a newline file, or in JSON, are fetched as raw HTML payloads for the future HTML cleaner.

For every batch, `failed-urls.json` is written in the output directory. It lists partial/failed captures and their errors while successful payloads remain in individual files.

Prerequisites: the API virtual environment, `ffmpeg` on `PATH`, and `GEMINI_API_KEY` in the root `.env`.
