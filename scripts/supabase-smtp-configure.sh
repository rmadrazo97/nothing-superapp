#!/usr/bin/env bash
#
# supabase-smtp-configure.sh
#
# Bypasses the Supabase dashboard SMTP settings panel (which silently 400s on
# save — task #69) by writing the SMTP config directly via the Management API:
#
#   PATCH https://api.supabase.com/v1/projects/{ref}/config/auth
#
# Reads all secrets from env (never hard-code creds). Also runs a follow-up GET
# and diffs the returned SMTP fields so you can eyeball that the write stuck.
#
# ── Required env ──────────────────────────────────────────────────────────────
#   SUPABASE_MGMT_TOKEN     Personal access token
#                           (create at https://supabase.com/dashboard/account/tokens)
#   SUPABASE_PROJECT_REF    Project ref, e.g. pqbwzcjiedllzafgczhx
#   SMTP_HOST               smtp.resend.com
#   SMTP_PORT               465
#   SMTP_USER               resend
#   SMTP_PASS               re_xxx…  (Resend API key)
#   SMTP_ADMIN_EMAIL        noreply@yourdomain.com  (verified sender in Resend)
#   SMTP_SENDER_NAME        e.g. "Nothing Superapp"
#
# ── Optional env ──────────────────────────────────────────────────────────────
#   SMTP_MAX_FREQUENCY      Seconds between emails to a single address (default 60)
#   DRY_RUN                 If "1", print the payload and exit without PATCHing
#
# ── Usage ─────────────────────────────────────────────────────────────────────
#   set -a && source .env.smtp && set +a
#   ./scripts/supabase-smtp-configure.sh
#
# Exit codes: 0 ok, 1 missing env, 2 API error, 3 verification mismatch.

set -euo pipefail

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: env var $name is required" >&2
    exit 1
  fi
}

for v in SUPABASE_MGMT_TOKEN SUPABASE_PROJECT_REF \
         SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS \
         SMTP_ADMIN_EMAIL SMTP_SENDER_NAME; do
  require "$v"
done

SMTP_MAX_FREQUENCY="${SMTP_MAX_FREQUENCY:-60}"
API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth"

# Build payload with jq so passwords with special chars are safely JSON-escaped.
PAYLOAD=$(jq -n \
  --arg host   "$SMTP_HOST" \
  --argjson port "$SMTP_PORT" \
  --arg user   "$SMTP_USER" \
  --arg pass   "$SMTP_PASS" \
  --arg admin  "$SMTP_ADMIN_EMAIL" \
  --arg sender "$SMTP_SENDER_NAME" \
  --argjson freq "$SMTP_MAX_FREQUENCY" \
  '{
     external_email_enabled: true,
     smtp_admin_email: $admin,
     smtp_host: $host,
     smtp_port: ($port | tostring),
     smtp_user: $user,
     smtp_pass: $pass,
     smtp_sender_name: $sender,
     smtp_max_frequency: $freq,
     mailer_secure_email_change_enabled: true,
     mailer_autoconfirm: false
   }')

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[dry-run] would PATCH $API with:"
  echo "$PAYLOAD" | jq 'del(.smtp_pass) + {smtp_pass:"<redacted>"}'
  exit 0
fi

echo "[1/2] PATCH $API"
RESP=$(curl -sS -w '\n%{http_code}' -X PATCH "$API" \
  -H "Authorization: Bearer ${SUPABASE_MGMT_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")

BODY=$(printf '%s' "$RESP" | sed '$d')
CODE=$(printf '%s' "$RESP" | tail -n1)

if [[ "$CODE" != "200" ]]; then
  echo "ERROR: PATCH returned HTTP $CODE" >&2
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 2
fi
echo "     ok"

echo "[2/2] GET verification"
GET_BODY=$(curl -sS -X GET "$API" \
  -H "Authorization: Bearer ${SUPABASE_MGMT_TOKEN}" \
  -H "Content-Type: application/json")

echo "$GET_BODY" | jq '{
  smtp_host, smtp_port, smtp_user, smtp_admin_email,
  smtp_sender_name, smtp_max_frequency,
  smtp_pass_set: (.smtp_pass | length > 0)
}'

# Verify the round-trip
GOT_HOST=$(printf '%s' "$GET_BODY" | jq -r '.smtp_host // ""')
if [[ "$GOT_HOST" != "$SMTP_HOST" ]]; then
  echo "ERROR: verification mismatch — expected smtp_host=$SMTP_HOST, got '$GOT_HOST'" >&2
  exit 3
fi

echo
echo "SMTP configured. Next: send a Supabase magic-link to a real address and"
echo "check the message headers — the sender should be $SMTP_ADMIN_EMAIL and"
echo "'Received:' should show smtp.resend.com."
