# Extraction v2 capture regressions

`test_extraction_v2_captured_payloads.py` discovers every JSON envelope in
`services/api/tests/captured-payloads`. The fixture-capture tool, review CLI,
and regression suite all exercise the identical source documents.

The default suite makes no network, browser, transcription, linked-page, or
Gemini requests. An offline smoke test validates and runs every discovered
capture through `LinguaLanguageDetector`, `RecipeEvidenceExtractor`, and
`ExtractionOrchestrator` with audio extraction disabled.

Exact reviewed assertions run when the capture has no transcript or has a saved
Gemini response under `audio_responses/`. Each fixture records the source
capture's SHA-256, model, and capture date beside the raw JSON response. The test
checks the hash before replay so a changed transcript or caption cannot reuse a
stale response; the regular audio adapter still validates and grounds it.
The hash uses capture bytes with CRLF line endings normalized to LF, so Windows
and Linux checkouts agree. When freezing a response, calculate `capture_sha256`
with `hashlib.sha256(capture_path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()`.

`instagram-DXWc3znDQkZ.json` is a reviewed exception to exact recipe-output
comparison. Its frozen response still runs through the production audio adapter
and merge pipeline. A dedicated offline test checks the complete outcome,
exactly retained and cited caption ingredients, transcript evidence IDs on audio
steps, and absence of empty facts or components. It does not treat the model's
step wording or segmentation as an exact quality gate; review those against the
source transcript separately. All other captures with saved responses retain
their exact reviewed assertions.

Captures with transcripts but no saved response are reported as skipped by the
exact test; their offline smoke still runs. At present, 43 reviewed captures
have transcripts: three have saved responses (two exact recipe checks and the
DXW contract replay), while 40 have smoke coverage only.

Live Gemini checks for captures without saved responses are opt-in and variable:

```powershell
$env:CARROT_RUN_LIVE_AUDIO_CAPTURE_TESTS = "1"
uv run --project services/api pytest services/api/tests/test_extraction_v2_captured_payloads.py -q
```

Unset the variable to restore the offline default. Do not use live output to
silently rewrite a reviewed expectation; review and freeze the raw response
first.

After manually reviewing a capture, add only the approved fields to
`expectations.json`. The test compares every supplied value exactly and ignores
unspecified fields, so expectations can grow as a capture is reviewed.

For example:

```json
{
  "expectations": {
    "html-example-com-soup.json": {
      "outcome": "complete",
      "recipe": {
        "title": "Soup",
        "yield_servings": "4",
        "total_time_minutes": 45,
        "nutrition": {"calories": "320"},
        "components": [
          {
            "name": "Main",
            "ingredients": [{"text": "1 onion"}],
            "steps": ["Cook the onion."]
          }
        ]
      }
    }
  }
}
```

Run one capture while reviewing it. If it has a transcript without a saved
response, this exact check is skipped by default; use the opt-in live command
above only when a fresh Gemini evaluation is intended.

```powershell
uv run --project services/api pytest services/api/tests/test_extraction_v2_captured_payloads.py -k pinchofyum -q
```

Run the entire captured-payload suite:

```powershell
uv run --project services/api pytest services/api/tests/test_extraction_v2_captured_payloads.py -q
```
