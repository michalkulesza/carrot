---
description: Apply this repo's code conventions (from CLAUDE.md) to one or more files
---

Target: $ARGUMENTS

If no target was given, ask which file(s) or folder to refactor before doing anything else.

Apply the code conventions already loaded into context from the root `CLAUDE.md` and any
nearer-scoped `CLAUDE.md`/`AGENTS.md` that apply to the target path (e.g. `apps/mobile/CLAUDE.md`
for anything under `apps/mobile/`). Don't ask the user to restate conventions — read them from
those files.

Process:
1. Read every file in scope in full before changing anything.
2. Go through each convention section (comments, readability/extraction rules, file
   organization/line-count splitting, data fetching, component declaration/export style,
   translations, and — if the target is under `apps/mobile/` — the mobile UI conventions) and
   check it against what's actually in the file(s).
3. Apply fixes directly with Edit/Write. When a file needs splitting per the file-organization
   rule, do the mechanical split (folder + helpers.ts/styles.ts/sub-components) without changing
   behavior.
4. Remove unused code you notice while touching a file (dead imports, vars, branches), per the
   Cleanup rule — even if unrelated to a specific convention violation.
5. After edits, verify: run typecheck for the affected package (e.g. `tsc --noEmit` from the
   right workspace) and confirm no new errors were introduced compared to before your changes.
6. Report a short summary of what changed, file by file. Do not commit — ask first, per this
   repo's commit-after-each-task instruction in CLAUDE.md, since the user may want to review.

If you're unsure whether something is a genuine convention violation vs. a reasonable existing
choice, flag it in your summary rather than changing it silently.
