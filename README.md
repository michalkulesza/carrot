<div align="center">

<img src="apps/web/public/icon-512.png" width="112" alt="Carrot logo" />

# Carrot

### Any recipe. One link away. 🥕

Paste a link from a food blog or a social video, and Carrot's AI turns it into a clean, cookable recipe<br/>
with ingredients, steps and nutrition. Plan meals and share shopping lists with your whole household, kept in sync live.

<br/>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Languages](https://img.shields.io/badge/i18n-EN%20·%20PL%20·%20DE%20·%20FR%20·%20ES-F97316?style=for-the-badge)

</div>

<br/>

<table>
  <tr>
    <td align="center"><img src="docs/images/m1.jpg" alt="Recipes home screen on mobile" /><br/><sub><b>Recipes</b></sub></td>
    <td align="center"><img src="docs/images/m2.jpg" alt="Meal plan on mobile" /><br/><sub><b>Meal plan</b></sub></td>
    <td align="center"><img src="docs/images/m3.jpg" alt="Shopping list on mobile" /><br/><sub><b>Shopping list</b></sub></td>
    <td align="center"><img src="docs/images/m4.jpg" alt="Allergens on mobile" /><br/><sub><b>Allergens</b></sub></td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><img src="docs/images/d1.png" alt="Recipes home on desktop" /><br/><sub><b>Recipes</b></sub></td>
    <td align="center"><img src="docs/images/d2.png" alt="Meal plan on desktop" /><br/><sub><b>Meal plan</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/d3.png" alt="Shopping list on desktop" /><br/><sub><b>Shopping list</b></sub></td>
    <td align="center"><img src="docs/images/d4.png" alt="Recipe detail on desktop" /><br/><sub><b>Recipe detail</b></sub></td>
  </tr>
</table>

## Features

- **AI recipe import:** works with websites and social videos. Imports run in the background.
- **Recipe library:** filter by meal, protein, carb, cuisine, time and tags, with semantic search.
- **Nutrition:** shows kcal, protein, fat and carbs for each recipe.
- **Households:** the recipes, meal plan and shopping list are shared and stay in sync live.
- **Meal plan and shopping lists:** shared with your household.
- **Allergens:** each recipe shows the allergens it contains.
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
