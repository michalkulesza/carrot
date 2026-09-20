# Extraction v2 capture regressions

`test_extraction_v2_captured_payloads.py` discovers every JSON envelope in
`services/api/tests/captured-payloads`. The fixture-capture tool, review CLI,
and regression suite all exercise the identical source documents.

Every discovered capture is an offline test by default. It runs the real HTML
cleaner, `LinguaLanguageDetector`, `RecipeEvidenceExtractor`, and
`ExtractionOrchestrator`. It has no network, browser, transcription, linked-page,
or Gemini dependency. New captures therefore start as passing execution checks.

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

Run one capture while reviewing it:

```powershell
uv run --project services/api pytest services/api/tests/test_extraction_v2_captured_payloads.py -k pinchofyum -q
```

Run the entire captured-payload suite:

```powershell
uv run --project services/api pytest services/api/tests/test_extraction_v2_captured_payloads.py -q
```
