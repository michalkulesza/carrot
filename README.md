# Carrot

Recipe management app. Frontend: React + Vite. Backend: FastAPI. Database: PostgreSQL.

## Prerequisites

- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Docker](https://www.docker.com/) (for the database)

## Running locally

### 1. Install dependencies

```bash
pnpm install
cd services/api && uv sync && cd ../..
```

### 2. Configure the local environment

Copy `.env.example` to `.env` for Docker Compose, and `services/api/.env.example` to `services/api/.env` for the locally running API. Fill in the required values in both files.

### 3. Start the web app and backend

```bash
pnpm be:web
```

This starts Docker Compose services (including the database and import worker), the local API, and the web frontend.

Frontend: http://localhost:5173 — local API: http://localhost:8088

## Environment variables

The root `.env` supplies Docker Compose; `services/api/.env` supplies the locally running API.

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `SECRET` | — | Auth secret |

## Semantic search rollout

Semantic recipe search uses `pgvector/pgvector:pg16` and Gemini embeddings. Deploy the database image first, then the API and worker, and queue a resumable backfill in batches:

```bash
docker compose exec worker uv run --no-sync python scripts/backfill_recipe_embeddings.py --batch-size 100
```

Repeat the command until it reports `queued=0`, then verify personal and household searches. Set `SEMANTIC_SEARCH_ENABLED=false` to roll back semantic results immediately; recipe saves and literal search continue to work, and existing vectors are retained for a later re-enable.
