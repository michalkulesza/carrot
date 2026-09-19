# Local Instagram fixture capture

## Goal

Provide a local command-line tool for creating frozen Instagram post and Reel fixtures for ExtractorV2 evaluation. The user supplies URLs and signs in to Instagram in a visible browser. The tool captures the post caption, creator identity, creator-authored comments/replies, and available media/audio references without sending the browser profile or credentials to Carrot services.

## Scope

- A Python CLI under `services/api/scripts/` accepting URLs as arguments or from a newline-delimited file.
- A persistent, headful Chrome profile controlled through Chrome DevTools Protocol, so the user can complete login or challenges without installing another browser runtime.
- One JSON fixture per URL, written to a caller-selected local directory.
- A versioned normalized envelope with capture metadata, comments, and media/audio status.
- A `scrapecreators_response` field whose Instagram subset is consumable by the existing `ScrapeCreatorsClient` parser.
- Tests for the fixture schema and ScrapeCreators compatibility.

## Exclusions

- No production import-path changes, API routes, database writes, or automatic credential handling.
- No bypassing access controls, rate limits, login challenges, or private-content permissions.
- No promise to download a separate audio track: Instagram often exposes only a video URL. The tool downloads the available video, extracts its audio locally, sends it to Gemini for transcription, and records the transcript or an explicit failure.

## Fixture contract

```json
{
  "schema_version": 1,
  "captured_at": "ISO-8601 UTC timestamp",
  "source_url": "https://www.instagram.com/reel/.../",
  "capture": { "status": "complete|partial|failed", "errors": [] },
  "scrapecreators_response": { "data": { "xdt_shortcode_media": {} } },
  "comments": [
    {
      "id": "stable DOM-derived identifier or null",
      "parent_comment_id": null,
      "author_handle": "...",
      "text": "...",
      "is_creator_authored": true,
      "authorship_evidence": "author handle matches post owner"
    }
  ],
  "audio": {
    "video_url": "https://... or null",
    "audio_title": "... or null",
    "audio_url": null,
    "transcript": "... or null",
    "status": "transcribed|transcription_failed|video_available|unavailable",
    "transcription_error": "... or null"
  }
}
```

The synthetic `scrapecreators_response` retains the fields read by the existing adapter: caption edges, thumbnail/display URL, owner username, and video URL. The ExtractorV2 test adapter reads this field exactly as it would a ScrapeCreators API response; comments and audio remain additional source evidence.

## Behaviour and safeguards

- Validate URLs as Instagram `/p/`, `/reel/`, or `/tv/` URLs and deduplicate them before capture.
- Process URLs serially and write each completed fixture atomically, so interruption does not lose prior work.
- Disable duplicate URLs in a single run; a re-run may overwrite only when `--overwrite` is passed.
- Expand visible comments repeatedly up to a bounded CLI limit. Mark the fixture partial when Instagram does not expose all comments.
- Keep only creator-authored comments/replies as extraction evidence, but record why each included comment is verified.
- Persist the browser profile and fixture output only locally, and ignore the default profile path.

## Verification

- Unit tests cover URL validation, fixture validation, creator-comment filtering, duplicate handling, and feeding the embedded response through the existing ScrapeCreators response parser.
- Manual smoke test: run the CLI, log in, capture one reel, and inspect the generated JSON before adding it to ExtractorV2 evaluation inputs.
