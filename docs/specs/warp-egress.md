# Route server-side recipe fetching through Cloudflare WARP

## Problem
The production VPS (Hetzner, `myvps`) has datacenter IPs that Cloudflare-protected recipe sites
(e.g. noracooks.com) challenge or block. Verified 2026-10-11: headless Chromium from the VPS gets
403 "Just a moment..."; the same Chromium through Cloudflare WARP gets 200 with the recipe.

## Infrastructure (done on `myvps`)
- `cloudflare-warp` installed, `warp-cli mode proxy`, SOCKS5 on `127.0.0.1:40000` (`warp-svc`, enabled).
- `warp-socks-bridge.service` (socat) exposes it to Docker at `172.17.0.1:40001`
  (reachable from containers as `host.docker.internal:40001` via `extra_hosts: host-gateway`).
- Only the SOCKS proxy is exposed; SSH/Caddy/other traffic is not routed through WARP.

## Scope
Every server-side fetch of a recipe site or its assets goes through WARP:

| Path | Code | Change |
|---|---|---|
| Chromium renderer (primary) | `services/renderer/server.mjs` | Egress proxy connects through upstream SOCKS5 (`RENDERER_UPSTREAM_SOCKS`), keeping SSRF pinning; `entrypoint.sh` allows only that host:port past the private-range firewall |
| Raw HTML fallback | `extraction_v2/production.py::_fetch_html` | httpx via `OUTBOUND_PROXY_URL` |
| Linked-page fallback | `extraction_v2/sources.py::HttpLinkedPageProvider` | httpx via `OUTBOUND_PROXY_URL` |
| Image proxy | `routes/proxy.py` | httpx via `OUTBOUND_PROXY_URL` |
| Thumbnail archive | `services/import_worker.py` | httpx via `OUTBOUND_PROXY_URL` |

Out of scope: video download for transcription (large media from social CDNs, unrelated to the
Cloudflare block), ScrapeCreators, email, APNs (third-party APIs, not scraping).
Device-captured HTML never hits the server fetch.

## Design
- `Settings.outbound_proxy_url: str | None` (env `OUTBOUND_PROXY_URL`, e.g. `socks5://host.docker.internal:40001`).
  Unset = current direct behaviour (local dev, tests).
- The five API sites pass `proxy=settings.outbound_proxy_url or None` to `httpx.AsyncClient`
  (no wrapper, so existing tests that monkeypatch `module.httpx.AsyncClient` keep working).
- Add `httpx[socks]` to `services/api` dependencies.
- The existing local `is_safe_public_destination` checks stay in front of every fetch.
- `compose.prod.yml`: `api`, `worker` get `OUTBOUND_PROXY_URL` and `extra_hosts`; `renderer` gets
  `RENDERER_UPSTREAM_SOCKS` and `extra_hosts`. Values are set in the VPS `.env`
  (`host.docker.internal:40001` / `socks5://host.docker.internal:40001`).

## Failure behaviour
If WARP is down, fetches fail (no silent direct fallback) — accepted, to avoid leaking the
blocked IP and getting inconsistent results. `warp-svc` and the bridge have `Restart=always`.

## Verification
1. Unit tests: renderer SOCKS client + proxy routing; each API site passes the configured proxy to httpx.
2. On the VPS after deploy: import a noracooks.com recipe end to end; confirm renderer
   logs/behaviour and that a direct (unset) run still gets the challenge.
3. `curl -x socks5h://127.0.0.1:40000 .../cdn-cgi/trace` shows `warp=on`.

## Rollout
Merge, let CI publish images, set `.env` vars on `myvps`, `docker compose -f compose.prod.yml up -d`
for `renderer api worker`. Rollback: unset the two env vars and recreate those services.
