# Residential egress via home Raspberry Pi

## Problem
Some recipe sites block datacenter *and* Cloudflare WARP IPs by reputation (verified 2026-10-11:
fiordifrolla.it / SiteGround SGCaptcha challenges WARP egress `104.28.x`). Those imports now fail
as `source_blocked` (see `completed/blocked-source-detection.md`). The phone fallback
(on-device HTML capture) only helps mobile users and needs the app in the foreground.

## Decision
- A Raspberry Pi on the home network gives the VPS a residential egress path, used **only as a
  fallback** after the normal (WARP) path hits a bot challenge.
- The Pi **replaces** the phone fallback for `source_blocked`: remove `SOURCE_BLOCKED` from
  `_DEVICE_CAPTURE_FAILURE_CODES`. On-device capture stays for its original codes
  (`source_fetch_failed`, `user_action_required`).
- If the Pi path is unavailable or also blocked, the job stays `source_blocked` (no hang, no phone
  fallback). The user can still paste the text.

## Infrastructure

### Tunnel (WireGuard, Pi dials out — no home port forwarding, works behind CGNAT / dynamic IP)
| | VPS (`myvps`) | Pi |
|---|---|---|
| Interface | `wg-home`, `10.66.0.1/24`, `ListenPort 51821/udp` (51820 is taken by the existing `wg0`; opened in the Hetzner Cloud Firewall for IPv4+IPv6) | `wg-home`, `10.66.0.2/24` |
| Peer AllowedIPs | `10.66.0.2/32` | `10.66.0.1/32` only — Pi's own traffic is **not** routed via the VPS |
| Keepalive | — | `PersistentKeepalive = 25` |
| Service | `wg-quick@wg-home` enabled | `wg-quick@wg-home` enabled |

Pi keeps `net.ipv4.ip_forward=0`: the VPS can reach only the SOCKS port, never the home LAN.

### SOCKS5 on the Pi (Dante 1.4.4 built from source — not packaged in Debian 13; `/usr/local/sbin/sockd`)
- `internal: 10.66.0.2 port = 1080`, `external: wlan0` IPv4 only (home LAN devices have public IPv6); client pass only from `10.66.0.1/32`.
- `socks block` for destinations `10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10,
  127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7, fe80::/10`; ports other than 80/443 blocked.
- Belt and braces: Pi `iptables -A OUTPUT -m owner --uid-owner danted -d <each private range> -j REJECT`.
- Dante resolves names itself (`socks5h`); point the Pi's resolver used by danted at a public
  resolver (e.g. `1.1.1.1`) so home-LAN names (`router.lan`) don't resolve.
- Block hairpin to the home's own public IPv4 (router WAN) via an nft set refreshed by a 5-min timer.
- The Pi runs Pi-hole (port 53, 80/443): danted gets its own resolv.conf with public resolvers.
- Pi firewall: `wg-home` accepts only tcp/1080 from `10.66.0.1`.

### VPS bridge (same pattern as WARP)
- `home-socks-bridge.service` (socat, `Restart=always`) exposes `10.66.0.2:1080` to Docker at
  `172.17.0.1:40002` → containers use `host.docker.internal:40002`.

### Status (2026-10-12): infrastructure done and verified
- `wg-home` MTU 1200 on both ends (home path carries ~1280-byte packets; larger broke container TLS).
- Dante has no `to: ::/0` block (it refused dual-stack hostnames); IPv6 is refused by `external.protocol: ipv4` + nft skuid rules.
- Pi `ip_forward=1` is Docker's; FORWARD policy DROP and `inet home_egress` drops all `wg-home` traffic except tcp/1080 from 10.66.0.1.
- Pi files: `/etc/wireguard/wg-home.*`, `/etc/danted*.conf`, `/etc/danted-hosts`, `danted.service`, `home-egress-nft.service`,
  `home-hairpin-update.{service,timer}`, `/etc/nftables.d/home-egress.nft`, `/usr/local/sbin/{sockd,update-home-hairpin.sh}`.
- VPS files: `/etc/wireguard/wg-home.*`, `home-socks-bridge.service` (172.17.0.1:40002).
- Verified: egress 92.211.3.121 via bridge and from containers; fiordifrolla returns the real page; LAN, router.lan,
  rpi.local, home public IP, IPv6 literals, non-80/443 ports all refused; recovers after `wg-quick@wg-home` restart.

## Application changes

### Config (`services/api/src/api/config.py`)
- `residential_proxy_url: str = ""` (env `RESIDENTIAL_PROXY_URL`, e.g. `socks5h://host.docker.internal:40002`).
- `residential_renderer_url: str = ""` (env `RESIDENTIAL_RENDERER_URL`, e.g. `http://renderer-residential:8080`).
- Both unset = feature off (local dev, tests) → current behaviour.

### Renderer — no code change
- New compose service `renderer-residential`: same image, `RENDERER_UPSTREAM_SOCKS=host.docker.internal:40002`,
  `extra_hosts: host-gateway`. The existing entrypoint firewall already allows only that host:port.

### Pipeline (`extraction_v2/production.py::acquire_and_extract_url`)
1. Normal path unchanged (WARP renderer → WARP raw fetch).
2. On `SourceBlocked`, if residential is configured: render via `residential_renderer_url`
   (`render_url(url, renderer_url=...)` — add the optional param to `html_renderer.render_url`);
   if that is a challenge or an operational renderer failure → raw `_fetch_html(url, proxy=residential_proxy_url)`
   (add optional `proxy` param, default `settings.outbound_proxy_url`).
3. Success → `_extract_html(..., render_status="residential_rendered" | "residential_raw_fallback")`.
   Still blocked / tunnel down (connect error) → `SOURCE_BLOCKED`, with a log line naming the step.
4. Concurrency: module-level `asyncio.Semaphore(2)` around residential attempts (home bandwidth,
   home IP reputation).

### Thumbnail archive (`services/import_worker.py`)
- If the archive fetch of the thumbnail fails with 403/429/503 or a challenge **and the import used
  the residential path** (`render_status` starts with `residential_`), retry once via `residential_proxy_url`.

### Phone fallback
- `routes/imports._DEVICE_CAPTURE_FAILURE_CODES`: drop `SOURCE_BLOCKED`. Update the related tests.
- Mobile/web: no change — `source_blocked` cards keep paste/retry/remove; the message stays accurate.

### Out of scope
Image proxy (`routes/proxy.py`), linked-page fetches, social/video, any default-route change.

## Compose / env (`compose.prod.yml`, VPS `.env`)
- `api`, `worker`: `RESIDENTIAL_PROXY_URL`, `RESIDENTIAL_RENDERER_URL` (default empty).
- `renderer-residential` service (as above).

## Verification
1. Unit tests: residential fallback runs only after `SourceBlocked`; success path; tunnel-down and
   still-blocked paths → `source_blocked`; feature off when env unset; semaphore; `source_blocked`
   no longer device-capture eligible; thumbnail retry only on residential imports.
2. Pi: from the VPS `curl -x socks5h://10.66.0.2:1080 https://ifconfig.me` shows the home IP;
   `curl -x socks5h://10.66.0.2:1080 http://192.168.1.1` and `http://router.lan` are refused.
3. Prod: re-import https://www.fiordifrolla.it/bolzano-apple-cake/ → recipe imported, trace shows
   `html_residential_*`.

## Rollout / rollback
Pi + VPS tunnel first (manual, verify step 2), then merge, deploy images, set env vars, `up -d`
`api worker renderer-residential`. Rollback: unset the two env vars and recreate `api worker`.

## Observability

- **Per-attempt fetch line (info) plus Sentry Log** for EVERY URL page fetch attempt (normal path and residential fallback), one each:
  `fetch_attempt route=direct|warp|residential step=render|raw outcome=ok|challenge|http_<code>|unavailable|renderer_<category> host=<hostname> duration_ms=<n> fallback=true|false`.
  Hostname only, never the full URL or query. The Sentry Log (`sentry_sdk.logger.info`, `enable_logs=True` in `init_sentry`; installed sentry-sdk 2.65 supports it, no bump needed) carries the same fields as attributes; with an empty DSN nothing is sent. `route=warp` when `OUTBOUND_PROXY_URL` is set, otherwise `direct` (the API cannot see the renderer container's own upstream env, so the normal render step follows `OUTBOUND_PROXY_URL` too); `fallback=true` for the raw step after a renderer failure and for all residential attempts.
- **Unreachable Pi**: warning log `event=residential_unavailable host=<hostname> step=render|raw error=<ExceptionType|renderer category>` AND a Sentry error (level error, fingerprint `["residential-egress", "unavailable"]`, tags `egress=residential`, `step`, `outcome`, `host`). Triggered by transport errors/timeouts on the raw step and renderer operational failures other than site-level ones (`http_*`, `empty_html`, `bot_challenge`).
- **Still blocked through residential** (final outcome challenge/http_403/429/503): Sentry error with fingerprint `["residential-egress", "blocked"]` and the same tags. At most one unavailable and one blocked event per request. No Sentry error on success.
- **Existing import-failure Sentry report** (`report_recipe_import_failure`) gains tags `egress=residential` and `residential_step=<last step>` when an import ends `source_blocked` after the residential fallback. No new Sentry events; nothing is sent on success.
  Threading: `acquire_and_extract_url` appends a `residential_blocked` trace event (`detail="<step>:<outcome>"`) to the `FailedOutcome`; the worker reads it into `ImportPipelineFailure.residential`.
- **Persistence for stats**: nullable `import_jobs.residential_step` (VARCHAR(16)) and `import_jobs.residential_outcome` (VARCHAR(32)), added by the startup `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` list in `main.py`. Set for every URL import that tried the fallback: success (`ok`, step derived from `render_status`), blocked/unavailable (final attempt's outcome via the trace event), and extraction failures after a successful residential fetch (`ok`). Not exposed in public API schemas.
- **Stats script**: `docker exec -w /app carrot-worker-1 uv run --no-sync python scripts/residential_stats.py [--days N]` (default 30) prints total URL imports, residential attempts, breakdown by outcome and step, success rate, per-day counts, and top 10 hosts (hostnames only; host comes from the job input URL, or the saved recipe's source URL for successful jobs).
