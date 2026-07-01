# PlateKeeper — Email Verification & Household Email Invitations

Adds transactional email to the API and three user-facing capabilities:

1. **Account confirmation with a code** — new users get a 6-digit code by email
   and type it into the app to activate their account.
2. **Resend verification email** — request a fresh code (rate-limited).
3. **Household invitations by email** — invite *any* email (registered or not);
   they get a nudge email, and the invite is claimed when they sign up / log in.

Status legend: ☐ todo · ◐ in progress · ☑ done

## Decisions (resolved 2026-07-01, via /grill-me)

| Area | Decision |
|---|---|
| Email provider | **Resend.com** HTTP API (`httpx`). New `email.py` service with a `send_email()` abstraction. |
| Console fallback | When Resend is unconfigured, log the email + code to stdout so local dev needs no API key. |
| Email language | **English only** for now (server-side). Client `t()` stays client-side. Localize later. |
| Verification style | **Code**, not fastapi_users' JWT-token link. Custom OTP system. |
| Code format | **6-digit numeric**, hashed at rest. |
| Code policy | 15-min expiry · max **5** wrong attempts → invalidate · **60s** resend cooldown · newest code supersedes older. |
| Enforcement | **Hard gate, no token**: login router uses `requires_verification=True`; no JWT until verified. New users start `is_verified=False`. |
| Existing users | One-time migration `UPDATE users SET is_verified=true` — grandfather everyone in; gate applies to new signups only. |
| Verify endpoints | Public: `POST /auth/verify-code {email, code}`, `POST /auth/request-verify-code {email}` (resend). `on_after_register` sends first code. |
| Post-verify UX | **Auto-login** using the password held in session memory → straight into the app. Cold-reopen falls back to login screen. |
| Invite target | **Any email** (registered or not). No more 404 for unknown emails. |
| Invite claim | Store invite by email when no account; on verify/login `SET invited_user_id = me WHERE invited_email = my_email AND pending`. Existing in-app list then works unchanged. |
| Deep links | **None.** No Universal Links / AASA / native rebuild. Email is a nudge; recipient opens the app and the invite is waiting. |
| Client scope | **Mobile + Web** parity. |

## Data model

- **`verification_codes`** (new): `id`, `user_id` (FK users, CASCADE), `code_hash`,
  `expires_at`, `attempts` (int, default 0), `created_at`. Newest per user wins.
- **`household_invitations`** (changed): `invited_user_id` → **nullable**;
  add **`invited_email`** (nullable, lower-cased). Registered invite sets both;
  email-only invite sets `invited_email` with `invited_user_id = NULL`.
- **`users`**: unchanged columns; migration flips existing `is_verified` to true.

## API

### Email service — `services/api/src/api/services/email.py`
- `send_email(to, subject, html, text)` → Resend `POST /emails` via `httpx`.
- `email_configured` gate; console fallback logs payload when unset.
- Templates (EN): verification-code email, household-invitation email.

### Config — `config.py` + env
- `resend_api_key: str = ""`, `email_from: str = ""`, `email_configured` property.

### Verification
- `on_after_register` → generate code, persist hash, send email.
- `POST /api/auth/request-verify-code {email}` — resend (respects cooldown; always
  200 to avoid email enumeration).
- `POST /api/auth/verify-code {email, code}` — validate; on success set
  `is_verified=true`, delete codes, **claim pending email invites**.
- Login routers switched to `requires_verification=True`.

### Invitations — `routes/households.py`
- `invite_user`: drop the 404-if-no-account path. If user exists → pending invite
  (as today) + email. Else → invite by `invited_email` + email. Dedupe by
  user *or* email. Always send the nudge email.
- Claim helper run on verify + login.

## Clients (mobile + web)

### Mobile (`apps/mobile`)
- `AuthContext`: `register` **stops** auto-calling `login`; add `verifyCode(email, code)`
  and `resendCode(email)`. Hold password in memory for post-verify auto-login.
- New route `app/(auth)/verify.tsx` + screen: 6-digit input, resend button with
  live cooldown timer, error states. Native iOS conventions (PlatformColor, 44pt
  targets, haptics). Register navigates here on success.
- All strings via `t()`, added to en/pl/de/fr/es.

### Web (`apps/web`)
- Parallel: register → code-entry view → verify → auto-login. Client methods for
  verify/resend. Strings translated in all 5 locales.

## Env (placeholders added)

Root `.env` / `.env.example`, `services/api/.env` / `.env.example`:
```
# --- Email (Resend — optional; console fallback when unset) ---
RESEND_API_KEY=          # Resend API key (re_...)
EMAIL_FROM=              # e.g. PlateKeeper <no-reply@yourdomain.com>
```
⚠️ **Ops prerequisite**: real delivery needs a Resend-verified sending domain +
API key. Until set, the API runs in console-fallback mode (codes/links logged).

## Build order

1. Backend: config + `email.py` + `verification_codes` model + migrations
   (grandfather users, invitation columns).
2. Backend: register hook, verify/resend endpoints, `requires_verification`, invite
   changes + claim.
3. Mobile: AuthContext + verify screen + register flow + i18n.
4. Web: verify view + client + i18n.
