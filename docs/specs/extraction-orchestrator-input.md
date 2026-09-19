# ExtractionOrchestrator input contract

## Purpose

The orchestrator is the sole source-aware layer of extraction v2. It accepts raw source payloads and decides whether to invoke the HTML cleaner, `ExtractorV2`, or later fallbacks. `ExtractorV2` receives only cleaned HTML or normalized plain text.

## Version 1 payloads

Every captured fixture is one JSON object with `schema_version: 1` and one of two `kind` values.

### Social source

```json
{
  "schema_version": 1,
  "kind": "social",
  "source_url": "https://www.instagram.com/reel/.../",
  "capture": { "status": "complete", "errors": [] },
  "scrapecreators_response": { "data": { "xdt_shortcode_media": {} } },
  "comments": [],
  "audio": {
    "video_url": null,
    "audio_url": null,
    "audio_title": null,
    "transcript": null,
    "status": "unavailable",
    "transcription_error": null
  }
}
```

The embedded response is parsed by the same ScrapeCreators response parser used for production imports. `comments` retain visible comments and a creator-authorship flag; the orchestrator selects only verified creator content. The capture CLI downloads the available video URL, extracts MP3 audio, sends it to Gemini for transcription, and stores the transcript or a structured transcription failure.

### Raw HTML source

```json
{
  "schema_version": 1,
  "kind": "html",
  "source_url": "https://example.com/recipe",
  "capture": { "status": "complete", "errors": [] },
  "html": "<!doctype html>..."
}
```

The capture tool saves the unmodified fetched document. The HTML cleaner—not the capture tool and not `ExtractorV2`—normalizes it into cleaned body HTML immediately before extraction.
