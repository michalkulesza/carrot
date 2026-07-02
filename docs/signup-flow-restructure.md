# PlateKeeper — Signup Flow Restructure (Verify-Before-Account)

Supersedes the signup portion of [`email-verification-invitations.md`](./email-verification-invitations.md)
(invitation claiming, email service, resend/cooldown mechanics, and mobile/web
parity from that doc still apply — see cross-references below).

## Problem

Today, `POST /api/auth/register` creates a real `users` row (with hashed
password) *before* the email is confirmed reachable. If the verification code
never arrives or expires, that row sits there permanently:

- Re-registering the same email → `UserAlreadyExists` (400), a dead end with
  no hint to log in or resend.
- The only recovery path is via Login → `LOGIN_USER_NOT_VERIFIED` → auto
  redirect to Verify — not discoverable from the Register screen's error.
- A startup hack in `main.py` (`UPDATE users SET is_verified = TRUE WHERE
  is_verified = FALSE`, runs on every API process restart) silently
  force-verifies stuck accounts on every deploy, masking the bug and
  undermining verification entirely.

Status legend: ☐ todo · ◐ in progress · ☑ done

## Decisions (resolved 2026-07-02, via /grill-me)

| Area | Decision |
|---|---|
| Core architecture | **Restructure**: verify email ownership *before* creating any `User` row or collecting a password. No account exists until signup is fully complete — eliminates the stuck-account bug at the root instead of patching around it. |
| Pending-signup storage | New **`pending_signups`** table (email, code_hash, expires_at, attempts, created_at), separate from `verification_codes` — no user_id to hang it off yet. |
| Code params | Same as existing verification codes: **6-digit numeric**, hashed at rest, **15-min expiry**, max **5** wrong attempts, **60s** resend cooldown, newest supersedes older. |
| Re-entering same email mid-flow | Treated as an implicit resend: reuses the 60s cooldown / delete-and-recreate logic. No separate "resend" affordance needed on the email step. |
| Existing-account collision | **Fail fast**: requesting a code for an email with an existing verified `User` returns a clear error ("account exists, log in instead") rather than enumeration-safe silence. (Low-value target app; UX clarity wins here.) |
| Error granularity | New `verify-signup-code` endpoint **distinguishes** wrong code / expired code / too-many-attempts (vs. today's single generic message), so the UI can point the user at the right recovery action. |
| Verify → Complete-profile handoff | **Signed short-lived token** (JWT-style, email claim) returned by `verify-signup-code` on success. Client submits it + password + nickname to `complete-signup`, which creates the `User` (`is_verified=True` from birth). |
| Token expiry | **24 hours** (not 15 min) — long enough to survive closing/backgrounding the app between verifying and finishing profile setup. |
| Token persistence | **Persisted** in secure storage (same as session token) so reopening the app within the window resumes directly at Complete Profile instead of restarting at email entry. |
| Invitation claiming | Moves from verify-time to **`complete-signup` time**, since a `user_id` only exists once the `User` row is created. |
| Old register endpoint | **Removed** — fastapi-users' default register router is deleted; the three new endpoints are the only account-creation path. Prevents any client/script from recreating an unverified `User` row. |
| Legacy stuck accounts | One-time **manual** cleanup migration (last run of the force-verify UPDATE), then the `main.py` startup hack is **deleted**. Post-migration, `is_verified=False` should never occur. |
| Post-signup UX | **Auto-login** immediately after `complete-signup` succeeds — no re-entering credentials on a Login screen. |
| Screen structure | **3 screens**: Email → Verify (code) → Complete Profile (password + nickname). Register screen splits into the first and third; Verify screen is adapted to operate on `pending_signups` instead of an existing `User`. |
| Client scope | **Mobile + Web** parity (same as original verification work). |
| Password-manager compatibility | Correct `textContentType`/`autoComplete` on all auth inputs: email → `emailAddress`/`email`; **new** password (Complete Profile) → `newPassword`/`new-password` (triggers strong-password suggestion + save); **existing** password (Login) → `password`/`current-password`. **Login screen audited/fixed in the same pass** as part of this work. |
| Logout confirmation | `Alert.alert()` destructive-confirm on mobile (Cancel / Log Out-destructive), equivalent confirm dialog on web. Strings via `t()` in all 5 locales. |

## Data model

- **`pending_signups`** (new): `id`, `email` (unique, lower-cased), `code_hash`,
  `expires_at`, `attempts` (int, default 0), `created_at`. Deleted on
  successful `complete-signup` or superseded by a fresh row on re-entry/resend.
- **`users`**: unchanged shape. Every row created via `complete-signup` starts
  `is_verified=True` — the `is_verified=False` state should no longer occur
  post-migration.
- **`verification_codes`**: unchanged, retained for any other future
  post-account verification needs (not used by signup anymore).

## API

### `POST /api/auth/request-signup-code {email}`
- Existing verified `User` with this email → 400 with a clear "account
  exists, log in" error.
- Existing `pending_signups` row <60s old → silent no-op (implicit resend
  behavior on re-entry).
- Otherwise delete any existing row for the email, create a fresh
  `pending_signups` row (new code, new 15-min expiry), send via existing
  `email.py` service (console fallback when Resend unconfigured, per
  [`email-verification-invitations.md`](./email-verification-invitations.md)).

### `POST /api/auth/verify-signup-code {email, code}`
- Validates against `pending_signups` (attempts cap 5, 15-min expiry).
- Returns **distinct** errors: `SIGNUP_CODE_INVALID`, `SIGNUP_CODE_EXPIRED`,
  `SIGNUP_CODE_TOO_MANY_ATTEMPTS`.
- On success: issues a signed token (email claim, 24h expiry). Does not yet
  create a `User` row.

### `POST /api/auth/complete-signup {token, password, nickname}`
- Validates token (signature + expiry).
- Creates `User` (`is_verified=True`), deletes the matching `pending_signups`
  row, runs invitation-claim logic (`_claim_email_invitations`, moved here
  from verify-time), commits.
- Issues session/JWT in the same response → client auto-logs-in.

### Removed
- `POST /api/auth/register` (fastapi-users default register router) —
  deleted from `main.py`.

### One-time ops task
- Run the existing force-verify UPDATE once more manually against
  currently-stuck accounts, then delete the `main.py` lifespan hack that
  runs it on every startup.

## Clients (mobile + web)

### Mobile (`apps/mobile`)
- `RegisterScreen.tsx` splits into an **Email screen** (email only →
  `request-signup-code`) and a **Complete Profile screen** (password +
  nickname → `complete-signup`, receives token from context).
- `VerifyScreen.tsx` adapted to call `verify-signup-code` and store the
  returned token via `AuthContext` (persisted to secure storage) instead of
  verifying an existing user.
- `AuthContext`: replaces `pendingEmail`/in-memory-password-for-auto-login
  with a persisted `pendingSignupToken` (email + token), consumed by
  `complete-signup`. Login screen's password field gets `textContentType=
  "password"` audit/fix as part of this same change.
- Logout button wrapped with `Alert.alert()` destructive-confirm.
- All new/changed strings via `t()`, added to en/pl/de/fr/es.

### Web (`apps/web`)
- Parallel structural split of `RegisterPage.tsx`, `VerifyPage.tsx` adapted
  the same way, `AuthContext` mirrors the persisted-token approach
  (`localStorage`/secure equivalent).
- Web password fields get `autoComplete="new-password"` (Complete Profile) /
  `autoComplete="current-password"` (Login) / `autoComplete="email"` (Email
  screen).
- Logout gets an equivalent confirm dialog.
- Strings translated in all 5 locales.

## Build order

1. Backend: `pending_signups` model/table, `request-signup-code`,
   `verify-signup-code` (with distinct error codes), `complete-signup`
   (incl. moved invitation-claim), signed-token issuance/validation.
2. Backend: remove old register router; one-time manual cleanup run; delete
   `main.py` startup hack.
3. Mobile: Email screen, adapted Verify screen, Complete Profile screen,
   `AuthContext` token persistence, Login-screen autofill audit, logout
   confirm, i18n.
4. Web: parallel screen split, `AuthContext` token persistence, autofill
   attributes, logout confirm, i18n.
