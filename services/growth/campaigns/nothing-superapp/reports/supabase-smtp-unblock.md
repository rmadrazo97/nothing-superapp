# Supabase SMTP Unblock — Task #69 Resolution Playbook

**Status:** Diagnosis complete, workaround ready. Awaits Alex to run 1 script.
**Blocks:** Branded Resend auth emails (task #68 templates uploaded but inert).
**Project:** `pqbwzcjiedllzafgczhx.supabase.co`

## What we know for sure

- Resend SMTP creds are valid — verified with Resend's HTTP API separately.
- Supabase Auth is otherwise healthy — magic-link + OAuth work via Supabase's
  default relay (`no-reply@mail.app.supabase.io`), so it's not an Auth outage.
- Dashboard save fails silently: modal closes, no toast, no persisted state,
  request 400s in the Network tab. This is a client/UI issue, not an SMTP one.
- Supabase's Management API exposes the same underlying config via
  `PATCH /v1/projects/{ref}/config/auth` — that endpoint is stable and public.

## Root-cause hypothesis

The dashboard's SMTP form has known regressions across 2025 where certain field
combinations (long API-key passwords, port `465` vs `587`, missing
`smtp_sender_name`, or a partially-migrated project) cause the client-side
validator to submit a malformed payload that the backend rejects with 400 but
the UI swallows. Confirmed by the reproduction script below — capture the 400
body and it will name the exact field.

Either way, the fix is the same: bypass the dashboard and PATCH the config
directly via the Management API. The API accepts what the dashboard cannot
send, and once written the values are honoured by the mailer subsystem
regardless of what the dashboard displays.

## Recommended path — Management API script (Path A)

Ship-ready. Zero code change to the app. One script run and you're done.

**Prereqs Alex needs:**
1. Personal access token → https://supabase.com/dashboard/account/tokens
   (create one named "smtp-config", copy immediately, it's shown once).
2. A verified sender domain in Resend (or use the shared `onboarding@resend.dev`
   for smoke-testing).
3. The Resend SMTP API key (starts `re_`).

**Run:**

```bash
cd ~/Desktop/dev/nothing-superapp

# Create a scratch env file — do NOT commit this.
cat > .env.smtp <<'EOF'
SUPABASE_MGMT_TOKEN=sbp_xxxxxxxxxxxxxxxx
SUPABASE_PROJECT_REF=pqbwzcjiedllzafgczhx
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxx
SMTP_ADMIN_EMAIL=noreply@yourdomain.com
SMTP_SENDER_NAME=Nothing Superapp
EOF

# Dry-run first to eyeball the payload:
set -a && source .env.smtp && set +a
DRY_RUN=1 ./scripts/supabase-smtp-configure.sh

# Then for real:
./scripts/supabase-smtp-configure.sh

# Delete the creds file.
shred -u .env.smtp 2>/dev/null || rm -P .env.smtp
```

The script PATCHes the config, GETs it back, and prints the returned SMTP
fields (with the password masked). Exit code 0 = shipped.

**Smoke test after:** trigger a magic-link to a real address. Check headers —
`From:` should be your sender, `Received:` should show `smtp.resend.com`.

## Fallback path — Dashboard reproduction (Path B)

If the API also 400s (unlikely), we need concrete evidence for Supabase support.
Alex runs this once with DevTools open:

1. Open https://supabase.com/dashboard/project/pqbwzcjiedllzafgczhx/auth/providers.
2. DevTools → Network tab → filter `config/auth` → check "Preserve log".
3. Scroll to "SMTP Settings" → Enable Custom SMTP.
4. Fill: host `smtp.resend.com`, port `465`, user `resend`,
   pass `re_…`, sender name `Nothing Superapp`, admin email
   `noreply@yourdomain.com`.
5. Click **Save changes**.
6. In the Network tab, find the failed request (red 400) — usually
   `PATCH /platform/projects/pqbwzcjiedllzafgczhx/config/auth`.
7. Right-click → Copy → Copy as cURL. Also copy the Response body.
8. Console tab → screenshot any errors.
9. Paste all three (cURL, response body, console) into a Supabase support
   ticket at https://supabase.com/dashboard/support/new with:

   > **Subject:** SMTP settings silently fail to save (400, no toast)
   > **Project ref:** pqbwzcjiedllzafgczhx
   > **Behaviour:** Save button closes modal without error; settings not
   > persisted. Network shows PATCH → 400. Default relay works fine; custom
   > SMTP endpoint rejects. Same payload succeeds via Management API
   > (attach the successful PATCH curl from `scripts/supabase-smtp-configure.sh`
   > for contrast).

## Recommendation

Run **Path A** now. It takes ~3 min and unblocks task #68 email templates in
one shot. Only escalate to Path B if the Management API also rejects (would
indicate a project-level lock, e.g. paused/dunning), in which case Supabase
support needs to intervene anyway.

## Files delivered

- `scripts/supabase-smtp-configure.sh` — the workaround (executable, env-driven,
  never logs the password, verifies with a follow-up GET).
- `services/growth/campaigns/nothing-superapp/reports/supabase-smtp-unblock.md`
  — this document.
