# Carrot

Carrot turns any link into a clean, cookable recipe and keeps your household's cooking in sync. Paste a link from a food blog or a social video, and Carrot's AI pulls out the ingredients, steps, servings and nutrition. Meal planning and shopping lists are shared across your household.

<p align="center">
  <img src="docs/images/m1.jpg" width="23%" alt="Recipes list on mobile" />
  <img src="docs/images/m2.jpg" width="23%" alt="Carrot mobile screen" />
  <img src="docs/images/m3.jpg" width="23%" alt="Carrot mobile screen" />
  <img src="docs/images/m4.jpg" width="23%" alt="Carrot mobile screen" />
</p>

<p align="center">
  <img src="docs/images/d1.png" width="49%" alt="Recipes table on desktop" />
  <img src="docs/images/d2.png" width="49%" alt="Carrot desktop screen" />
  <img src="docs/images/d3.png" width="49%" alt="Carrot desktop screen" />
  <img src="docs/images/d4.png" width="49%" alt="Carrot desktop screen" />
</p>

## Features

- **AI recipe import:** works with websites and social videos. Imports run in the background.
- **Recipe library:** filter by meal, protein, carb, cuisine, time and tags, with semantic search.
- **Nutrition:** shows kcal, protein, fat and carbs for each recipe.
- **Households:** the recipes, meal plan and shopping list are shared and stay in sync live.
- **Meal plan and shopping lists**
- **Cook mode:** a step-by-step view built for use in the kitchen.
- **Five languages:** English, Polski, Deutsch, Français, Español.

## Repository layout

| Path                                          | What it is                                       |
| --------------------------------------------- | ------------------------------------------------ |
| [apps/web](apps/web)                          | Web app (React + Vite)                           |
| [apps/mobile](apps/mobile)                    | iOS / Android app (Expo)                         |
| [apps/showcase](apps/showcase)                | Marketing site                                   |
| [packages/shared](packages/shared)            | Code shared between the apps                     |
| [services/api](services/api)                  | Backend API and import worker (FastAPI + PostgreSQL) |
| [services/renderer](services/renderer)        | Rendering service                                |
| [tools](tools)                                | Extraction review and fixture capture tooling    |
| [docs](docs)                                  | Specs, backlog, changelog and diagrams           |

## Prerequisites

- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Docker](https://www.docker.com/) (for the database and worker)

## Running locally

1. Install dependencies:

   ```bash
   pnpm install
   cd services/api && uv sync && cd ../..
   ```

2. Copy `.env.example` to `.env` (used by Docker Compose). Copy `services/api/.env.example` to `services/api/.env` (used by the local API). Fill in the required values in both files.

3. Start the backend together with a client:

   ```bash
   pnpm be+web       # API + web app
   pnpm be+ios       # API + iOS app
   pnpm be+android   # API + Android app
   ```

   Each command starts the Docker Compose services (the database and the import worker) and the local API, then launches the client.

Web app: http://localhost:5173. Local API: http://localhost:8088

## Environment variables

| Variable          | Default                 | Description                  |
| ----------------- | ----------------------- | ---------------------------- |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins         |
| `DATABASE_URL`    | —                       | PostgreSQL connection string |
| `SECRET`          | —                       | Auth secret                  |

## Semantic search rollout

Semantic recipe search uses `pgvector/pgvector:pg16` and Gemini embeddings. Deploy in this order: the database image first, then the API and the worker. Then queue a resumable backfill, which runs in batches:

```bash
docker compose exec worker uv run --no-sync python scripts/backfill_recipe_embeddings.py --batch-size 100
```

Run the command again until it reports `queued=0`. Then check that personal and household searches work. To roll back, set `SEMANTIC_SEARCH_ENABLED=false`. Semantic results switch off right away, while recipe saves and literal search keep working. Existing vectors are kept, so you can turn it back on later.

## License

<!-- TODO: no LICENSE file yet. Add one and name it here. -->
