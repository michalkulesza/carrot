# Semantic recipe search

Status: ready for review

## Goal

Let a signed-in user search the Recipes library with natural language, for
example, "something warm and spicy for a cold night", while retaining precise
literal lookup for titles and ingredients. The feature applies to the Recipes
library on web and mobile only; meal-plan recipe pickers keep their existing
literal, local search.

## Agreed product behaviour

- Search is hybrid: exact title and ingredient matches rank first, followed by
  de-duplicated semantic matches.
- The client waits 350 ms after the last keystroke and requires three
  characters before issuing a semantic query. Literal results remain visible
  while it waits and while the request is in flight.
- Each search returns at most 20 semantic candidates. The API excludes results
  below a server-configured similarity threshold. Scores and AI explanations
  are not shown to users.
- A recipe saves immediately. Embedding work happens asynchronously; until it
  succeeds, that recipe is available through literal search only.
- Failed embedding jobs retry. If embedding generation or search is unavailable,
  the app continues with literal search without an error state; failures are
  observable through server logging/monitoring.
- An embedding represents recipe data only: title, tags, component names,
  ingredients, steps, notes, total time, and nutrition. It excludes account,
  household, contributor, URL, image, and other internal metadata.
- Use Gemini `gemini-embedding-2` at 768 dimensions, storing vectors in
  pgvector. Every vector records its model/version so an incompatible model or
  dimension change can trigger a full re-index.

## Design

### Storage and deployment

1. Change the `db` image in `compose.yml` and `compose.prod.yml` from the plain
   PostgreSQL image to the matching PostgreSQL 16 pgvector image. Preserve the
   existing named volumes.
2. Extend startup schema initialization to enable `vector` idempotently before
   any vector-dependent table/index DDL runs.
3. Add a `recipe_embeddings` table rather than putting vectors directly on
   `recipes`. It should have a one-to-one recipe foreign key with cascade
   deletion, `vector(768)` value, model identifier, embedding-document hash,
   source recipe update/version timestamp, creation/update timestamps, and
   retry/error metadata.
4. Add a pgvector nearest-neighbour index appropriate for cosine-distance
   retrieval (HNSW), plus an ordinary index for finding queued/stale embeddings.
   Keep index parameters and the semantic similarity cutoff in configuration,
   with safe defaults.
5. Add an idempotent, durable embedding-work queue (or equivalent claimed-job
   fields on `recipe_embeddings`) so multiple worker processes cannot generate
   the same current embedding concurrently. Claim work transactionally with
   `FOR UPDATE SKIP LOCKED`, use bounded exponential retry, and make a newer
   recipe revision supersede stale in-flight work.

### Embedding lifecycle

1. Add a focused embedding service alongside the existing Gemini service. It
   builds a deterministic labelled text document from the agreed recipe fields,
   hashes it, and uses Gemini's retrieval document/query formatting consistently
   for `gemini-embedding-2`.
2. Add embedding configuration: model, dimensions (768), search cutoff, maximum
   result count (20), worker batch size, retry cap/backoff, and optional
   enablement flag. Validate the returned vector length before persistence.
3. On every recipe create, update, CSV import, and successful import-job recipe
   creation, mark the current recipe document pending. Tag additions/removals
   and household/personal-link operations that change searchable scope must also
   mark or preserve embeddings correctly. Do not call Gemini in the request
   transaction.
4. Extend the existing worker process to claim and process embedding jobs in
   addition to import jobs. It should read the current recipe and tags after
   claiming, skip deleted/stale work, save only an embedding that still matches
   the current document hash, and record retryable vs terminal failures.
5. Provide an operator-only backfill command that queues all recipes missing an
   embedding or using an older model/document version. It must be resumable,
   idempotent, batchable, and report counts without exposing recipe text.

### Search API

1. Add an authenticated `GET /recipes/search` endpoint with a validated query
   parameter and optional limit. Keep it before `/{recipe_id}` routes.
2. Apply the existing `_recipe_filter` before ranking so personal, household,
   and linked recipes never cross scope boundaries. Preserve the current viewer
   fields (`is_favourite`, `shared_to_personal`, and contributor display data) in
   the response.
3. Generate one query embedding outside the database transaction. Query the
   current-model vectors with cosine distance, cutoff, and limit, returning
   ranked `RecipeOut` records plus only the minimal metadata clients need to
   merge results.
4. Bound query length, reject empty/too-short semantic queries at the API
   boundary, set a short request timeout, and treat Gemini/database failures as
   an empty semantic-result response with structured server-side telemetry.
5. Keep literal matching client-side for this release. The endpoint is only the
   semantic candidate source; clients merge it after literal title/ingredient
   matches and remove duplicate IDs.

### Shared client and library UI

1. Add a typed `searchRecipes` API-client method and a React Query hook keyed by
   active household scope and normalized query. Use cancellation/request identity
   so a late response cannot replace results for a newer query.
2. Update the web Recipes search overlay to show literal sections immediately
   and a clearly labelled semantic section once available. Keep the existing
   selection/open-detail behaviour and show an accessible in-input loading state
   during the debounced semantic request.
3. Update the mobile native search flow to retain its literal filtering and
   merge the semantic candidates into the displayed library list after the same
   debounce. Preserve native search-bar behaviour, safe-area layout, and the
   existing search-focus tag-filter handling.
4. Add every new user-visible string to `en`, `pl`, `de`, `fr`, and `es`. Avoid
   strings for backend-only errors because those remain non-blocking.
5. Keep the meal-plan picker and Add Recipe personal picker unchanged except for
   any shared API/type changes that do not alter their literal search behaviour.

### Observability and operations

1. Emit structured logs/monitoring events for queue depth, job claim/completion,
   retries, terminal failures, model/version mismatch, embedding latency, query
   latency, and returned-result count. Do not log recipe text, query text, or
   vectors.
2. Document production rollout: deploy the pgvector image, enable the extension,
   deploy API/worker support, run the resumable backfill, then verify index use
   and semantic search in personal and household contexts.
3. Document rollback: disable semantic search through configuration while
   leaving recipe writes and literal search unaffected; retain vectors for a
   later re-enable.

## Verification

### Backend tests

- Unit-test deterministic embedding-document construction, exclusion of private
  fields, hashing, model/version handling, vector-length validation, retry
  classification, and stale-job supersession.
- Use PostgreSQL with pgvector in integration tests to verify extension/index
  setup, cosine ordering, cutoff, result limit, and deleted-recipe cleanup.
- Test `GET /recipes/search` authentication and every existing personal,
  household, and personal-link scope path to prove no cross-scope result leaks.
- Test create/update/import/tag-change queueing, duplicate enqueue safety,
  concurrent worker claims, retry/backoff, successful persistence, and
  graceful provider/database failures.

### Client tests

- Test the 350 ms debounce, three-character minimum, loading state, cancelled
  stale requests, literal-first merge ordering, ID de-duplication, empty
  semantic result, and silent failure fallback.
- Test web overlay and mobile library rendering with a semantic result, while
  confirming meal-plan pickers retain literal-only search.
- Verify all five locale files contain the new UI keys.

### Manual acceptance checks

1. Create/import recipes that exercise cuisine, ingredients, dietary tags,
   timing, notes, and preparation style; complete the backfill.
2. In both personal and household scope on web and mobile, search a natural
   language request such as "something warm and spicy for a cold night" and
   verify relevant recipes appear after literal results.
3. Search an exact title and ingredient; verify literal results remain first.
4. Rapidly type, clear, and change scope; verify no stale result flashes and no
   duplicate requests change the final results.
5. Temporarily make Gemini unavailable; verify recipe save and literal search
   still work, failed work retries, and no recipe content appears in logs.
