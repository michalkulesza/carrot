# Misc
- Before committing, ask the user to confirm the change is fully complete and correct — do not commit on your own judgment that a task is "successful." Only commit after they confirm.
- When implementing a plan from .md include that file in the commit
- Keep plans under `docs/specs/` while they are pending or in progress. Move a plan into `docs/specs/completed/` only after its implementation is fully complete.

# Production VPS access
- The `myvps` SSH host (~/.ssh/config, root@167.235.18.105, key `~/.ssh/platekeeper_deploy`) is available for debugging production issues — use `ssh myvps` freely to check `docker ps`, `docker logs <container>`, Caddy config/logs (`/etc/caddy/Caddyfile`, `sudo journalctl -u caddy`), etc.
- Caddy on that host terminates TLS for all `*.carrot.xcxz.xyz` domains; `app.carrot.xcxz.xyz` routes `/api/*` to the API container (127.0.0.1:8088) and everything else to the web container (127.0.0.1:8089). There is no separate `api.carrot.xcxz.xyz` host — don't point `API_PROXY_TARGET` or similar config at it.

# Project-specific conventions
General code style, file-organization, mobile UI, and readability conventions live in the
global `~/.claude/CLAUDE.md` (a symlink into the private `claude-conventions` repo) and apply
here automatically — this file only holds what's specific to `carrot`.

## Translations
This project's locale files: en, pl, de, fr, es. Add new keys to all 5 when introducing strings.
