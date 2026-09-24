# Image imports through extractor v2

Status: implementation complete and accepted for the production path by the user on 2026-09-24. Deployment awaits the repository's commit and push workflow. The live pancake image, API suite, and isolated database job test passed. Vision accuracy on genuine handwriting remains unverified.

## Goal

Transcribe image text once with Gemini Vision, then process that exact transcript through the existing v2 text extraction, language, enrichment, unit conversion, outcome, and persistence flow.

## Acceptance criteria

- The vision prompt requests only visible text in reading order, with headings, line breaks, and uncertainty preserved. It must not request recipe facts or inference.
- A successful image import makes one vision request per job attempt; existing v2 model requests may follow.
- Complete and incomplete recipes use the same v2 enrichment and storage path as pasted text. Failed outcomes and transient errors use existing job retry and failure codes.
- Source evidence contains the transcript. The private recipe capture contains a bounded copy of the original image and transcript; neither is written to logs.
- Tests cover cookbook pages, screenshots, handwriting, no recipe, unreadable images, and the one vision request contract.

## Approach

Add a dedicated Gemini image transcription function with a plain text response. Decode and validate image input in the worker, transcribe, then pass the text through a distinct image-text payload and the common v2 result assembly. Keep the image in the private `RecipeSourceEvidence.capture` JSON, bounded to 8 MiB and retained only for successful or incomplete imports. Reject transcripts over 20,000 characters rather than silently truncate them. Use the existing household-scoped source evidence endpoint's current omission of capture to avoid exposing image bytes in normal API responses. Any future capture endpoint needs an explicit permission review.

## Verification

The API suite passed with 341 tests and 43 skips after the image-job database test was added. That test passed separately against a disposable local pgvector database. The web production build, mobile TypeScript check, and targeted web lint passed. The offline image-path tests use representative cookbook-page, screenshot, and handwritten-card transcript strings and verify routing, evidence, and classification. They do not measure the vision model's accuracy against real images.

One live cookbook-style WebP sample (`1067w-th2vYhbjEsY.webp`) was checked with `transcribe_image_text` and `extract_image_transcript`. Vision captured the visible "Sweet potato bowl" title, 2 servings, 15 minutes, and ingredient lines accurately. V2 returned `UNSUPPORTED_LANGUAGE` because its directions and notes were Latin placeholder text. This sample validates transcription of those visible elements and the typed language-failure path; it does not validate a successful image import or extraction quality on genuine recipe directions.

A separate live English PNG smoke check produced a complete recipe but exposed a missing title in v2 text extraction. Image transcripts now recover a short title adjacent to recipe section markers and attach a source text reference. Offline tests cover both a title before Ingredients and the cookbook layout with ingredients in one column followed by title, servings, and Directions in another. An unlabeled `15 minutes` in a transcript does not establish whether it means total, prep, or cook time, so v2 leaves source total time unset; enrichment may provide an AI estimate with AI provenance. The real WebP sample still cannot validate successful import because of its placeholder directions.

A second live WebP sample (`566w-Cln80zeGmm0.webp`) completed `_run_pipeline` with all 8 ingredients and 6 numbered steps, but its title was initially saved as `RECIPE`: vision faithfully split the heading into adjacent `THE PANCAKE` and `RECIPE` lines. Image title recovery now joins two short adjacent heading-style lines before Ingredients and keeps a separate source reference for each line. A focused regression test verifies `THE PANCAKE RECIPE` and both exact references; another ensures an unrelated prose line is not joined. Rerunning the same image through `_run_pipeline` returned a complete recipe titled `THE PANCAKE RECIPE`, with 8 ingredients, 6 steps, and `image_transcript` evidence. A disposable Postgres integration test also confirmed one saved recipe and private source capture across repeated processing. Handwriting accuracy has not been tested with a real sample; the user accepted the production cutover with this limitation.
