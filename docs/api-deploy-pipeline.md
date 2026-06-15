# API Deploy Pipeline (GitHub Actions → VPS + Caddy)

Goal: on every change to the API, automatically build it, ship it to the VPS, and serve it
at **`https://api.recipes.xcxz.xyz`** with TLS terminated by **Caddy**.

## Chosen approach (recommended)

```
push to master (services/api/**)
        │
        ▼
GitHub Actions
  ├─ lint + test            (fast feedback, blocks deploy on failure)
  ├─ build Docker image     (services/api → linux/amd64)
  └─ push to GHCR           ghcr.io/<owner>/platekeeper-api:<sha> + :latest
        │
        ▼  (SSH)
VPS
  ├─ docker compose pull api          # pull the new image
  ├─ docker compose up -d api db      # recreate the api container
  └─ smoke test  curl /healthz
        │
        ▼
Caddy (system service on VPS)
  api.recipes.xcxz.xyz  →  reverse_proxy 127.0.0.1:8000   (auto Let's Encrypt TLS)
```

**Why this shape**
- *Build in CI, not on the VPS* — the VPS only pulls a finished image, so deploys are fast,
  reproducible, and don't need the source tree, `uv`, or a build toolchain on the server.
- *GHCR* — free for this repo, authenticates with the built-in `GITHUB_TOKEN`, no extra account.
- *Caddy as a system service* — `recipes.xcxz.xyz` (web) and `api.recipes.xcxz.xyz` (API) likely
  share the VPS; a single system Caddy fronts all subdomains and handles TLS automatically.
  (Alternative: run Caddy inside the compose stack — see "Alternatives".)

## Assumptions (confirm before implementing)

1. The VPS already has **Docker + Docker Compose v2** installed, and SSH access with a key.
2. **Caddy is installed as a system service** on the VPS (`apt install caddy`). If you'd rather run
   Caddy in Docker, use the alternative compose layout below.
3. DNS: an **A/AAAA record for `api.recipes.xcxz.xyz`** points at the VPS public IP (required for
   Caddy to obtain a Let's Encrypt cert).
4. Postgres runs **on the VPS** as a compose service (mirroring local `compose.yml`). The DB volume
   is persistent and **not** rebuilt on deploy.
5. The schema is created automatically at API startup (`Base.metadata.create_all`). There are **no
   Alembic migrations** yet — see "Open questions".

---

## Step 1 — Dockerfile for the API

New file: `services/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

# uv for fast, locked installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install deps first (cached layer), without the project itself
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Then the app source
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

EXPOSE 8000
# Matches the local run command (uvicorn src.api.main:app)
CMD ["uv", "run", "--no-sync", "uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build context is `services/api/` (the API is self-contained — it does not import the TS
`packages/shared`). Add a `services/api/.dockerignore`:

```
.venv/
__pycache__/
*.pyc
.env
.pytest_cache/
.ruff_cache/
.mypy_cache/
```

## Step 2 — Production compose on the VPS

The VPS holds its own `compose.prod.yml` and `.env` (neither is committed; `.env` is gitignored).
Keep this file at e.g. `/opt/platekeeper/compose.prod.yml`.

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: platekeeper
      POSTGRES_USER: platekeeper
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U platekeeper"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  api:
    image: ghcr.io/<owner>/platekeeper-api:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    # Publish ONLY to localhost; system Caddy reverse-proxies to it.
    ports:
      - "127.0.0.1:8000:8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/healthz').status==200 else 1)\""]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

The VPS `.env` (create once, by hand — never commit):

```
SCRAPECREATORS_API_KEY=...
GEMINI_API_KEY=...
ALLOWED_ORIGINS=https://recipes.xcxz.xyz
DATABASE_URL=postgresql+asyncpg://platekeeper:<password>@db:5432/platekeeper
SECRET=<long random string>          # openssl rand -hex 32
POSTGRES_PASSWORD=<same password as in DATABASE_URL>
```

> Note: inside compose the DB host is `db`, not `localhost`.

## Step 3 — Caddy (system service)

Edit `/etc/caddy/Caddyfile`, add:

```
api.recipes.xcxz.xyz {
    reverse_proxy 127.0.0.1:8000
}
```

Then `sudo systemctl reload caddy`. Caddy provisions and renews the Let's Encrypt cert
automatically. This is a **one-time manual setup**, not part of the pipeline.

## Step 4 — GitHub Actions workflow

New file: `.github/workflows/deploy-api.yml`

```yaml
name: Deploy API

on:
  push:
    branches: [master]
    paths:
      - "services/api/**"
      - ".github/workflows/deploy-api.yml"
  workflow_dispatch:

concurrency:
  group: deploy-api
  cancel-in-progress: false

env:
  IMAGE: ghcr.io/${{ github.repository_owner }}/platekeeper-api

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/api
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --frozen
      - run: uv run pytest

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: services/api
          push: true
          tags: |
            ${{ env.IMAGE }}:latest
            ${{ env.IMAGE }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /opt/platekeeper
            echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ secrets.GHCR_USER }} --password-stdin
            docker compose -f compose.prod.yml pull api
            docker compose -f compose.prod.yml up -d db api
            docker image prune -f
            # smoke test
            for i in $(seq 1 15); do
              if curl -fsS http://localhost:8000/healthz; then echo "API healthy"; exit 0; fi
              sleep 2
            done
            echo "API failed health check" && exit 1
```

### Required GitHub secrets

| Secret | Purpose |
|---|---|
| `VPS_HOST` | VPS hostname or IP |
| `VPS_USER` | SSH user (with docker permissions) |
| `VPS_SSH_KEY` | Private SSH key for that user (deploy key) |
| `GHCR_USER` | GitHub username (for the VPS to pull the image) |
| `GHCR_TOKEN` | PAT with `read:packages` (VPS pull auth) |

> If you make the GHCR package **public**, the VPS doesn't need to log in and you can drop
> `GHCR_USER` / `GHCR_TOKEN` and the `docker login` line.

---

## One-time VPS bootstrap (manual, before first deploy)

```bash
# 1. Install Docker + compose plugin and Caddy (skip what's already present)
# 2. Create the deploy directory and files
sudo mkdir -p /opt/platekeeper && cd /opt/platekeeper
sudo nano compose.prod.yml        # paste Step 2
sudo nano .env                    # paste Step 2 env, real secrets
# 3. Add the Caddy block (Step 3) and reload Caddy
# 4. First pull + up
docker compose -f compose.prod.yml up -d
curl -fsS http://localhost:8000/healthz
```

---

## Alternatives considered

- **Caddy inside compose** — add a `caddy` service to `compose.prod.yml` (ports 80/443), mount a
  `Caddyfile` that does `reverse_proxy api:8000`, and drop the `127.0.0.1:8000` publish. Fully
  self-contained, but the compose stack then owns 80/443, which conflicts with a system Caddy or
  other sites on the box. Prefer this only if the VPS hosts *just* this stack.
- **Build on the VPS (git pull + docker build)** — simpler secrets (no registry) but slower deploys,
  requires the toolchain on the server, and couples deploy to a working build environment. Rejected.
- **Plain rsync + systemd/uvicorn (no Docker)** — fewer moving parts but no isolation/repeatable
  env, and you'd manage the Python runtime + Postgres by hand. Rejected in favour of Docker.

## Open questions / follow-ups

1. **DB migrations.** Schema is currently auto-created at startup with no Alembic. That's fine for
   additive changes on a fresh DB, but will *not* alter existing tables. Recommend adding Alembic and
   a `migrate` step in the deploy script before `up -d` once the schema starts evolving in prod.
2. **Web frontend deploy.** This plan covers the API only. The web app (`apps/web`) will need its own
   pipeline/host (likely static build → `recipes.xcxz.xyz`). Out of scope here.
3. **Secret rotation & backups.** Decide on a Postgres backup strategy (e.g. nightly `pg_dump` to
   off-box storage) — deploys recreate the container but the named volume persists, so this is about
   disaster recovery, not deploys.
4. **Confirm the assumptions block above** (Docker/Caddy already installed, DNS record exists,
   GHCR public vs private) before implementing.

## Implementation checklist

- [ ] Add `services/api/Dockerfile` + `.dockerignore`
- [ ] Add `.github/workflows/deploy-api.yml`
- [ ] Create `compose.prod.yml` + `.env` on the VPS
- [ ] Add the `api.recipes.xcxz.xyz` block to the system Caddyfile; reload Caddy
- [ ] Add GitHub secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_USER`, `GHCR_TOKEN`)
- [ ] Point DNS `api.recipes.xcxz.xyz` → VPS
- [ ] Trigger via `workflow_dispatch` and verify `https://api.recipes.xcxz.xyz/healthz`
