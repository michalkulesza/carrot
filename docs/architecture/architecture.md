# Carrot — architecture

Five views, all as Mermaid so they render on GitHub and can be pasted into Miro,
Notion, Obsidian, or draw.io. A pre-laid-out `carrot-architecture.drawio` with the
same content lives next to this file for whiteboard tools.

1. [System context & deployment](#1-system-context--deployment)
2. [Recipe import & enrichment pipeline](#2-recipe-import--enrichment-pipeline) — the core of the product
3. [Gemini prompt chain](#3-gemini-prompt-chain)
4. [Data model](#4-data-model)
5. [Background jobs, realtime & notifications](#5-background-jobs-realtime--notifications)
6. [Semantic search](#6-semantic-search)

---

## 1. System context & deployment

Monorepo (`pnpm` workspaces + `uv` for Python): three frontends, one FastAPI service
run as two containers (HTTP API + background worker), Postgres with `pgvector`.

```mermaid
flowchart TB
    subgraph clients["Clients"]
        ios["iOS app<br/>Expo 56 / RN 0.85 / expo-router<br/>React Query + AsyncStorage persist<br/>Share Extension · WebView import<br/><i>apps/mobile</i>"]
        web["Web SPA<br/>React 19 + Vite, cookie auth<br/><i>apps/web</i>"]
        showcaseweb["Showcase site<br/>marketing / demo<br/><i>apps/showcase</i>"]
        publicpage["Public recipe page<br/>/public/recipes/:token<br/>(unauthenticated)"]
    end

    subgraph shared["packages/shared"]
        sharedpkg["createApiClient · types.ts<br/>i18n (en·pl·de·fr·es) · utils · hooks"]
    end

    subgraph vps["Hetzner VPS — 167.235.18.105"]
        caddy["Caddy<br/>TLS for *.carrot.xcxz.xyz<br/>app.carrot…/api/* → :8088<br/>app.carrot…/*  → :8089"]
        subgraph compose["docker compose (compose.prod.yml)"]
            api["api container<br/>FastAPI + uvicorn :8000→8088<br/>ghcr.io/…/carrot-api"]
            worker["worker container<br/>python -m api.worker<br/>same image, no HTTP"]
            webc["web container<br/>nginx static :8089"]
            showc["showcase container<br/>nginx static :8090"]
            db[("db container<br/>pgvector/pgvector:pg16<br/>volume platekeeper_postgres_data")]
        end
    end

    subgraph external["External services"]
        gemini["Google Gemini<br/>extraction · enrichment<br/>transcription · embeddings"]
        scrape["ScrapeCreators API<br/>Instagram / TikTok metadata"]
        r2["Cloudflare R2<br/>recipe thumbnails"]
        apns["Apple APNs<br/>import-complete pushes"]
        resend["Resend<br/>verification e-mails"]
        gid["Google Identity<br/>ID-token verification"]
        sentry["Sentry<br/>API + RN error reporting"]
    end

    subgraph ci["CI/CD"]
        gha["GitHub Actions<br/>deploy-api / deploy-web / deploy-showcase"]
        ghcr["GHCR images"]
    end

    ios --> sharedpkg
    web --> sharedpkg
    sharedpkg -->|"HTTPS + SSE"| caddy
    showcaseweb --> caddy
    publicpage --> caddy

    caddy --> api
    caddy --> webc
    caddy --> showc

    api <--> db
    worker <--> db
    api -.->|"in-process<br/>showcase reset loop"| db

    api --> gemini
    api --> r2
    api --> resend
    api --> gid
    api --> sentry
    worker --> gemini
    worker --> scrape
    worker --> apns
    worker --> sentry
    apns -.-> ios

    gha --> ghcr
    ghcr -->|"SSH pull + up -d"| compose
```

**Notes**

- There is no `api.carrot.xcxz.xyz`; the API is path-routed under `app.carrot.xcxz.xyz/api/*`.
- The API and the worker are the *same image* with different commands. The API never
  runs the import pipeline itself — it only enqueues jobs.
- Schema is managed by `Base.metadata.create_all()` plus a long list of idempotent raw
  `ALTER TABLE … IF NOT EXISTS` statements in `main.py:lifespan` (and `worker.py:main`).
  There is no Alembic.
- Auth: `fastapi-users` with two backends — cookie (web) and JWT bearer (mobile), both
  requiring a verified user. Sign-up is a code-by-e-mail flow (`pending_signups` →
  `verify-signup-code` → `complete-signup`); Google Sign-In is a separate route.

---

## 2. Recipe import & enrichment pipeline

Everything a user "adds" goes through one job queue. Three input kinds (`url`, `text`,
`image`), and for URLs a cascade of increasingly expensive strategies.

```mermaid
flowchart TB
    start(["User: paste URL / share sheet / paste text / photo"])
    enqueue["POST /api/imports/jobs<br/>{kind, input, idempotency_key, model?}<br/><b>idempotent</b> on (user_id, idempotency_key)<br/>429 if ≥20 active jobs for the user"]
    jobrow[("import_jobs<br/>status=pending<br/>+ import_job_events: import_job.created")]
    claim["worker: 3 concurrent loops, poll 2 s<br/>SELECT … FOR UPDATE SKIP LOCKED<br/>status=pending AND next_attempt_at ≤ now<br/>→ running + event"]
    ctx["load household tags + allergens<br/>household.allergens ∪ user_preferences.personal_allergens<br/>verify caller is still a household member"]

    start --> enqueue --> jobrow --> claim --> ctx --> kind{"job.kind"}

    kind -->|text| textpath["text[:6000]<br/>run_text_import_stream"]
    kind -->|image| imgpath["base64 → inline blob<br/>run_image_import_stream<br/>(Gemini vision)"]
    kind -->|url| social{"tiktok.com or<br/>instagram.com?"}

    social -->|no| fetch["curl_cffi GET, impersonate=chrome, 15 s<br/><i>(plain httpx gets 429'd by TLS fingerprinting)</i><br/>og:image → thumbnail, domain → creator_handle"]
    fetch --> structured{"structured recipe found?"}
    structured -->|"JSON-LD @type=Recipe<br/>(incl. @graph, HowToSection)"| ldtext["render clean text<br/>stage = link"]
    structured -->|"microdata itemprop"| ldtext
    structured -->|"domain parser<br/>kwestiasmaku · oliveandmango"| ldtext
    structured -->|no| striphtml["_strip_html: drop script/nav/aside/…<br/>drop comment/newsletter/promo/… nodes<br/>prefer article/main, cap 4000 chars<br/>stage = transcript"]

    social -->|yes| reel["ScrapeCreators<br/>/v1/tiktok/video · /v1/instagram/post<br/>→ caption, thumbnail, handle, video_url, linked_urls"]
    reel --> s1{"stage 1: caption<br/>complete recipe?"}
    s1 -->|no| s2{"stage 2: up to 3 linked URLs<br/>fetch each, same JSON-LD/strip path"}
    s2 -->|no| s3["stage 3: video_url<br/>download ≤100 MB → ffmpeg<br/>mono 16 kHz 48 kbps mp3, ≤10 min, ≤20 MB<br/>→ Gemini transcription"]

    ldtext --> extract
    striphtml --> extract
    textpath --> extract
    imgpath --> extract
    s1 -->|yes| extract
    s2 -->|yes| extract
    s3 --> extract

    extract["<b>Gemini extraction chain</b><br/>faithful extract → enrich → step references<br/>(see prompt-chain diagram)"]
    complete{"_is_complete?<br/>any component has ingredients<br/>AND any has steps"}
    extract --> complete

    complete -->|no| userfix["failure_code = user_action_required<br/>(page reachable but recipe partial,<br/>image post, video 403/404)"]
    complete -->|yes| allerg["_with_allergens<br/>per component → analyze_allergens"]

    allerg --> save["_save_recipe"]
    save --> saved[("recipes row<br/>+ recipe_households link<br/>+ recipe_tags<br/>+ recipe_embeddings (pending)")]
    saved --> done["job → succeeded, input cleared<br/>event import_job.succeeded"]

    fetch -.->|fetch error| fail
    reel -.->|scraper error| userfix
    extract -.->|exception| fail
    fail["_fail_or_retry"]
    userfix --> fail
    fail --> transient{"transient?<br/>network/timeout/429/500/503"}
    transient -->|"yes, retry_count < 3"| requeue["status=pending<br/>next_attempt_at = now + 30 s<br/>event retry_scheduled"] --> claim
    transient -->|no| failed["status=failed + failure_code<br/>event import_job.failed<br/>Sentry (URL sanitized, no content)"]

    done --> notify(["SSE + APNs — see realtime diagram"])
    failed --> notify
```

### What `_save_recipe` writes into `recipes.components` (JSONB)

Per component: `name`, `yield_note`, `ingredients` (flattened display strings),
`shopping_list_ingredients`, `shopping_list_categories`, `steps`,
`metric_ingredients`, `imperial_ingredients`, `metric_steps`, `imperial_steps`,
`ingredient_flags` (allergen / substitute / substitute_applied), and
`step_ingredient_refs` (per-step list of `{ingredient_index, mention, display?}`).

If `user_preferences.auto_substitute` is on, the allergen substitute replaces the
ingredient name at flatten time and `substitute_applied` is recorded. Ingredient text
also runs through `_normalize_ingredient_punctuation`, which rewrites the model's
occasional `garlic (, minced)` into `garlic, minced`.

---

## 3. Gemini prompt chain

Every extraction is **three calls, not one**: a deliberately dumb faithful extraction,
then a separate enrichment pass that is allowed to derive things, then a third pass that
does nothing but link ingredients to steps. This split is what keeps hallucinated
ingredients out of saved recipes.

```mermaid
flowchart TB
    subgraph phaseA["Phase A — faithful extraction (settings.gemini_extraction_model, default gemini-2.5-flash)"]
        pa["<b>_EXTRACTION_SYSTEM</b><br/>temperature 0 · response_schema = RecipeSourceExtraction<br/>―<br/>Preserve original language.<br/>Only what is explicitly in the source: never add ingredients,<br/>change numbers, estimate, convert units, round, infer steps,<br/>calculate nutrition, assign tags, detect allergens, add refs.<br/>One component per explicit section. Servings only if stated<br/>(range → midpoint). Units restricted to a 14-value enum;<br/>anything else stays whole in <i>name</i> with null qty/unit.<br/>Keep punctuation faithful — no invented parentheticals."]
        paout["<b>RecipeSourceExtraction</b><br/>title · servings · components[]<br/>component: role, name, yield_note,<br/>ingredients[{qty, unit, name}], steps[]"]
        pa --> paout
    end

    subgraph phaseB["Phase B — enrichment (gemini-2.5-flash-lite)"]
        pb["<b>_ENRICHMENT_SYSTEM</b> (embeds <b>_UNIT_CONVERSION_SYSTEM</b>)<br/>temperature 0 · response_schema = RecipeEnrichment<br/>input = {source_recipe, available_tags?}<br/>―<br/>Source title/servings/ingredients/steps are authoritative<br/>and must not be returned or altered."]
        pbrules["<b>Unit rules</b> metric = g/kg/ml/l/°C, imperial = cups/tbsp/tsp/°F.<br/>tsp & tbsp never converted. cup → ingredient-specific whole grams, no ranges.<br/>inches → cm. Counts stay counts (onion, clove, stalk, slice, cube, bunch,<br/>sprig, pinch) in BOTH variants. Cans are the exception: metric estimates<br/>drained weight and keeps '(1 can)'; imperial keeps the can.<br/><br/><b>shopping_list_value</b> per ingredient — round UP indivisible items<br/>(0.5 onion → 1 onion), never round weights/volumes.<br/><b>shopping_list_category</b> — one of 6 stable IDs, never a localized label.<br/><b>total_time_minutes</b> — active kitchen time, excludes passive resting.<br/><b>kcal/protein/fat/carbs per serving</b> — REQUIRED, estimated if unstated.<br/><b>tags</b> — only from available_tags, never invented."]
        pbout["<b>RecipeEnrichment</b><br/>per component, parallel arrays:<br/>metric_ingredients · imperial_ingredients<br/>metric_steps · imperial_steps<br/>shopping_list_values · shopping_list_categories<br/>+ total_time_minutes, macros, tags"]
        pb --> pbrules --> pbout
    end

    subgraph phaseC["Phase C — step references (gemini-2.5-flash-lite)"]
        pc["<b>_STEP_REFERENCE_SYSTEM</b><br/>temperature 0 · response_schema = RecipeStepReferences<br/>input = {source_recipe} · skipped entirely when no component<br/>has both ingredients and steps<br/>―<br/>Components, ingredient indexes and step indexes are authoritative.<br/>Link only when the step explicitly names the ingredient, an<br/>unambiguous key noun, plural, abbreviation, or inflected form,<br/>and the mention is an exact substring of the step.<br/>Never infer from 'the ingredients', 'the mixture', 'combine',<br/>'seasoning'. display carries a divided ingredient's portion,<br/>otherwise null. Matches inflected languages (pl, ru, cz, de)."]
        pcout["<b>RecipeStepReferences</b><br/>components[].step_refs[{step_index, ingredient_index, mention, display?}]<br/>invalid response → empty, recipe still saves without refs"]
        pc --> pcout
    end

    paout --> pb
    paout --> pc

    subgraph validate["Validation loop — up to 3 attempts"]
        v1{"parses? schema-valid?<br/>total_time_minutes present when there is content?<br/>_validate_metric_ingredients:<br/>no cup/lb/oz/inch left without a metric unit"}
        v2["re-prompt with<br/><i>previous_validation_error</i><br/>'regenerate every field, preserve counts'"]
        v1 -->|no, attempt < 3| v2 --> pb
        v1 -->|"no, attempt 3 & metric-only"| repair
        v1 -->|yes| repair
    end
    pbout --> v1

    subgraph deterministic["Deterministic repair — no model call"]
        repair["<b>_repair_enrichment_alignment</b>"]
        r1["array length ≠ source length → fall back to source values"]
        r2["_repair_unconverted_metric_ingredients → source value"]
        r3["_preserve_spoon_measurements — tsp/tbsp lines revert to source"]
        r4["_preserve_discrete_ingredient_measurements — count-based lines revert<br/>(cans exempt in metric; lines with an inline convertible measure pass through)"]
        r5["_repair_shopping_list_categories — unknown/missing → 'other'"]
        r6["<b>_repair_step_refs</b> (runs on the Phase C output)<br/>drop out-of-range refs; mention must be an exact<br/>normalized substring of the step; drop generic mentions<br/>('ingredients', 'mixture', 'seasoning'); remap to the<br/>best-scoring ingredient when unambiguous; dedupe"]
        repair --> r1 --> r2 --> r3 --> r4 --> r5
    end
    pcout --> r6

    assemble["<b>assemble_recipe</b>(source, enrichment, step_references)<br/>strict re-check of every array length and ref range<br/>(raises rather than saving a misaligned recipe)<br/>→ RecipeExtraction"]
    r5 --> assemble
    r6 --> assemble

    subgraph allergens["Allergen pass — only when the household/user declares allergens"]
        al["<b>_ALLERGEN_SYSTEM</b> (flash-lite)<br/>numbered ingredient list + allergen list<br/>Report only with reliable evidence in the ingredient text.<br/>Generic sauces/stocks/pastes are NOT proof of gluten.<br/>Substitute must re-scale amounts, not copy numbers."]
        alfilter["_discard_unsubstantiated_allergen_flags<br/>clear the flag when text says 'gluten-free', or when a<br/>variable-formulation product was flagged gluten/ncgs<br/>without an explicit wheat/barley/soy-sauce/… token"]
        al --> alfilter
    end
    assemble --> al

    usage["<b>UsageTracker</b> — input/output tokens and call count<br/>accumulated across every Gemini call in one import"]

    transcribe["<b>_TRANSCRIPTION_SYSTEM</b> (gemini-2.5-flash, temp 0)<br/>near-verbatim, original language, never translate or summarize,<br/>never invent from title/caption/visuals, [inaudible] instead of guessing"]
    transcribe -.->|"video path only"| pa

    retry["<b>_with_retry</b> — exponential backoff on 429/503/RESOURCE_EXHAUSTED<br/>(1·2·4·8 s, or the 'generous' ladder up to 60 s for backfills)"]
    retry -.-> pa
    retry -.-> pb
    retry -.-> pc
    retry -.-> al
    retry -.-> transcribe
```

> **Note:** Phase C is uncommitted work in the tree at the time of writing — step
> references used to be one more field on the enrichment response. `RecipeEnrichment`
> still carries a `step_refs` field, but `assemble_recipe` prefers the Phase C result
> whenever it is passed one.

**Where each prompt lives:** all of them are module-level constants in
`services/api/src/api/services/gemini.py`.

`_UNIT_CONVERSION_SYSTEM` is also used standalone by `estimate_unit_variants()`, which
backfills metric/imperial variants for recipes saved before the unit-system feature
(`scripts/backfill_unit_variants.py`). Likewise `recommend_shopping_list_values()` and
`recommend_shopping_list_categories()` exist as single-purpose prompts for backfills.

---

## 4. Data model

```mermaid
erDiagram
    users ||--o| user_preferences : has
    users ||--o{ household_members : "belongs to"
    households ||--o{ household_members : has
    users }o--|| households : "active_household_id"
    households ||--o{ household_invitations : issues
    households ||--o{ household_leave_notifications : raises
    users ||--o{ verification_codes : "e-mail verify"
    pending_signups }o--o{ users : "pre-account"

    users ||--o{ recipes : "author_id (SET NULL)"
    recipes }o--o{ households : recipe_households
    recipes }o--o{ tags : recipe_tags
    households ||--o{ tags : "household-scoped (or is_default)"
    recipes }o--o{ recipes : recipe_related_recipes
    users }o--o{ recipes : user_recipe_favourites
    recipes ||--o| recipe_embeddings : "1:1 vector job"
    recipes ||--o| recipe_public_shares : "7-day token"
    recipe_public_shares ||--o{ recipe_public_share_library_additions : "copied by"

    households ||--o{ meal_plan_entries : "unique (household_id, date)"
    recipes ||--o{ meal_plan_entries : "recipe_id or free text"
    households ||--o{ shopping_list_items : has

    users ||--o{ import_jobs : creates
    households ||--o{ import_jobs : scopes
    import_jobs ||--o{ import_job_events : emits
    users ||--o{ device_subscriptions : "APNs tokens"

    recipes {
        uuid id PK
        uuid author_id FK "nullable, SET NULL on user delete"
        string title
        int servings
        int total_time_minutes
        int kcal_per_serving
        int protein_per_serving
        int fat_per_serving
        int carbs_per_serving
        string thumbnail_url "R2 URL"
        string creator_handle
        string source_url
        json components "the whole recipe body — see below"
        string notes
        int position "manual ordering"
        datetime created_at
        datetime updated_at
    }

    recipe_embeddings {
        uuid recipe_id PK "1:1 with recipes"
        vector embedding "VECTOR(768), HNSW cosine index"
        string model
        int dimensions
        string document_version
        string document_hash "sha256 of the embedding document"
        string status "pending|running|succeeded|failed"
        int retry_count
        datetime next_attempt_at
        datetime claimed_at
        string last_error
    }

    import_jobs {
        uuid id PK
        uuid user_id FK
        uuid household_id FK
        uuid idempotency_key "unique with user_id"
        string status "pending|running|succeeded|failed|cancelled"
        string kind "url|text|image"
        json input "cleared after terminal state"
        string model "optional model override"
        uuid result_recipe_id FK
        string failure_code
        string diagnostic_error
        int retry_count
        datetime next_attempt_at
        datetime started_at
        datetime dismissed_at
    }

    import_job_events {
        int id PK "serial — doubles as the SSE Last-Event-ID cursor"
        uuid job_id FK
        uuid household_id
        uuid user_id
        string type "created|running|succeeded|failed|retry_scheduled|cancelled|dismissed"
        json payload "a full ImportJobOut snapshot"
        datetime sse_dispatched_at
        datetime push_dispatched_at
        int push_attempt_count
    }

    user_preferences {
        uuid user_id PK
        int week_start_day
        bool auto_substitute "apply allergen substitutes on import"
        jsonb personal_allergens
        string language "en|pl|de|fr|es"
        string unit_system "metric|imperial"
        jsonb recipe_serving_overrides
        jsonb shopping_categories "ordered, user-customisable"
        bool show_completed_shopping_items
    }

    households {
        uuid id PK
        string name
        string color
        jsonb allergens "household-wide"
        string invite_code "unique, 8 chars, rotatable"
    }
```

**`recipes.components` (JSONB) — the denormalised recipe body**

```jsonc
[{
  "name": "For the sauce",
  "yield_note": "",
  "ingredients":            ["2 tbsp soy sauce", "1 clove garlic, minced"],
  "shopping_list_ingredients": ["2 tbsp soy sauce", "1 garlic clove"],
  "shopping_list_categories":  ["pantry", "produce"],
  "steps":              ["Whisk the soy sauce and garlic."],
  "metric_ingredients":   ["2 tbsp soy sauce", "1 clove garlic, minced"],
  "imperial_ingredients": ["2 tbsp soy sauce", "1 clove garlic, minced"],
  "metric_steps":   ["…°C…"],
  "imperial_steps": ["…°F…"],
  "ingredient_flags": [{ "allergen": "gluten", "substitute": "2 tbsp tamari",
                         "substitute_applied": false, "original_display": null }],
  "step_ingredient_refs": [[{ "ingredient_index": 0, "mention": "soy sauce" }]]
}]
```

Access control is uniform: nearly every route depends on `get_active_household_id`,
which resolves `users.active_household_id`, re-verifies membership, silently falls back
to any other membership, and raises `409 NO_ACTIVE_HOUSEHOLD` when the user has none.
Recipe visibility is `EXISTS (SELECT 1 FROM recipe_households WHERE …)` — there is no
personal-vs-household sentinel any more (see `docs/specs/completed/household-v2.md`).

---

## 5. Background jobs, realtime & notifications

```mermaid
flowchart LR
    subgraph workerproc["worker container — asyncio.gather"]
        wl1["_worker_loop ×3<br/>import jobs"]
        wl2["_embedding_worker_loop<br/>×EMBEDDING_WORKER_BATCH_SIZE (3)"]
        wl3["_push_loop<br/>APNs relay, 2 s"]
        boot["_requeue_stale on boot<br/>running → pending for both queues<br/>(recovers from a crash mid-job)"]
    end

    subgraph apiproc["api container"]
        sse1["GET /api/imports/jobs/events<br/>SSE, DB-backed<br/>snapshot + Last-Event-ID resume<br/>polls import_job_events by household"]
        sse2["GET /api/shopping-list/stream<br/>SSE via in-memory Broadcaster<br/>+ presence (15 s TTL, per-item edit locks)"]
        sse3["GET /api/recipes/stream<br/>GET /api/meal-plan/stream<br/>Broadcaster fan-out"]
        showcaseloop["showcase reset loop<br/>showcase@demo.com restored from<br/>showcase_fixture.json after 1 h idle"]
    end

    db[("Postgres")]
    wl1 --> db
    wl2 --> db
    wl3 --> db
    boot --> db
    sse1 --> db
    showcaseloop --> db

    wl3 -->|"undispatched succeeded/failed events<br/>× device_subscriptions"| apns["APNs alert<br/>'Recipe added' / 'needs your input' / 'Couldn't add recipe'<br/>data: {type, job_id, recipe_id}"]
    apns --> ios["iOS app"]

    sse1 --> clients["Web + iOS<br/>React Query cache invalidation"]
    sse2 --> clients
    sse3 --> clients

    note["<b>Broadcaster</b> is in-process asyncio queues,<br/>so shopping-list realtime assumes a single API worker.<br/>Import events deliberately go through the DB instead,<br/>which is why they survive restarts and multi-worker setups."]
```

The two realtime mechanisms are intentionally different:

| | Import jobs | Shopping list / recipes / meal plan |
|---|---|---|
| Transport | SSE | SSE |
| Backing store | `import_job_events` table | in-memory `Broadcaster` |
| Resume | `Last-Event-ID` → serial cursor | snapshot on connect only |
| Survives restart | yes | no |
| Multi-worker safe | yes | no (documented swap: LISTEN/NOTIFY or Redis) |

---

## 6. Semantic search

```mermaid
flowchart TB
    save["recipe created or updated<br/>(import, manual save, CSV import, public-share copy)"]
    queue["queue_recipe_embedding<br/>UPSERT recipe_embeddings status=pending, retry_count=0"]
    save --> queue

    claim["_claim_embedding_job<br/>FOR UPDATE SKIP LOCKED → running"]
    queue --> claim

    doc["build_embedding_document<br/>canonical JSON: title, sorted tags,<br/>per-component {name, ingredients, steps},<br/>notes, total_time_minutes, nutrition<br/>→ sha256 document_hash"]
    claim --> doc

    embed["Gemini embed_content<br/>gemini-embedding-2, task_type=RETRIEVAL_DOCUMENT<br/>output_dimensionality=768 (length-validated)"]
    doc --> embed

    recheck{"document_hash still current?"}
    embed --> recheck
    recheck -->|"no — recipe changed mid-flight"| requeue["back to pending, immediate retry"] --> claim
    recheck -->|yes| store[("UPDATE recipe_embeddings<br/>embedding = CAST(:v AS vector)<br/>status=succeeded, stamp model/dims/version")]

    embed -.->|error| retry{"429/503/timeout/unavailable/connection?"}
    retry -->|"yes, retry_count < EMBEDDING_RETRY_CAP (6)"| backoff["next_attempt_at = now + 5 s · 2^n (capped)"] --> claim
    retry -->|no| dead["status=failed, terminal"]

    subgraph query["GET /api/recipes/search?q=…"]
        q1["q ≥ 3 chars, SEMANTIC_SEARCH_ENABLED"]
        q2["embed query, task_type=RETRIEVAL_QUERY<br/>8 s asyncio timeout"]
        q3["JOIN recipe_embeddings, filter by household,<br/>model + dimensions + document_version + status=succeeded<br/>1 - (embedding &lt;=&gt; query) ≥ 0.55<br/>ORDER BY distance, LIMIT ≤20"]
        q4["any failure → log + return [] (search degrades, never 500s)"]
        q1 --> q2 --> q3
        q2 -.-> q4
        q3 -.-> q4
    end
    store --> q3

    hnsw["index: HNSW on vector_cosine_ops<br/>m=16, ef_construction=64<br/>created in initialize_vector_schema"]
    hnsw -.- q3

    backfill["scripts/backfill_recipe_embeddings.py --batch-size 100<br/>re-queues anything missing / stale model / stale dimensions /<br/>stale document_version; run until it reports queued=0"]
    backfill --> queue
```

Rollback is a config flip: `SEMANTIC_SEARCH_ENABLED=false` makes `/search` return `[]`
and stops queueing, while stored vectors are retained for a later re-enable.

---

## Operational notes worth keeping in view

- **Idempotency everywhere on the write path.** Import jobs are keyed on
  `(user_id, idempotency_key)` and return `200` instead of `201` on replay; the
  household link and embedding rows are `ON CONFLICT DO … `; job claiming uses
  `SKIP LOCKED`. This is the `AGENTS.md` "repeated user actions" rule made concrete.
- **Import caching is currently off** — `_IMPORT_CACHE_ENABLED = False` in
  `pipeline.py`, with the TTL cache module still present.
- **Orphan cleanup.** `recipes.author_id` is `ON DELETE SET NULL` so household recipes
  survive an account deletion; `delete_orphan_recipes` then removes recipes with no
  author *and* no household link, and deletes their R2 thumbnails.
- **Failure reporting is content-free.** `report_recipe_import_failure` strips query
  strings from source URLs and sends only kind/reason/size to Sentry — never the pasted
  recipe text or image.
- **The showcase account** (`showcase@demo.com`) is a public demo login reset from a
  JSON fixture after an hour of inactivity, driven by a task started in the API's
  lifespan.
