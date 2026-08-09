# Nothing-branded auth emails

Six Supabase Auth email templates styled with the Nothing OS look — dark canvas, Doto headline, cadmium red accent, Space Mono / Space Grotesk stack, no hex codes outside this file (email clients can't reach `design-system/styles.css`, so tokens are inlined).

| File | Supabase template slot | When it fires |
|---|---|---|
| `confirm-signup.html` | Confirm signup | New signup confirms email |
| `magic-link.html` | Magic link / OTP | User taps "Send magic link" on `/login` |
| `recovery.html` | Reset password | Password reset request |
| `email-change.html` | Change email address | User changes email in Settings |
| `reauthentication.html` | Reauthentication | Sensitive action requires re-verify (uses `{{ .Token }}` OTP) |
| `invite.html` | Invite user | Admin `inviteUserByEmail` |

Plus `_base.html` — the abstract template with `{{HEADING}}` / `{{BODY}}` / `{{CTA_URL}}` / `{{CTA_LABEL}}` / `{{POSTSCRIPT}}` slots for building new variants fast.

## Applying to Supabase

Supabase Free tier locks template editing behind custom SMTP configuration. Before pasting these in:

1. Set up custom SMTP in Supabase dashboard → Auth → Emails → SMTP Settings. Fastest option: **Resend** (3k/mo free tier, 30-second signup, paste the SMTP block).
2. Once SMTP is live, Templates tab becomes editable.
3. For each of the 6 templates, open the row on `Auth → Emails → Templates`, replace the HTML with the corresponding file here, keep the subject line short and title-case ("Confirm your email", "Your sign-in link", "Reset your password", "Confirm your new email", "Your Nothing Superapp code", "You're invited to Nothing Superapp").

## Constraints these templates respect

- **Table-based layout** — divs work in modern email clients but tables survive Outlook.
- **No CSS variables** — Outlook + older Gmail eat them.
- **Web fonts loaded via `<link>` with system-font fallback** — the fallback stack is `Courier New` for the display face (Doto) so the "instrument panel" tone survives if fonts fail.
- **Dark theme locked** — `prefers-color-scheme` detection is unreliable; the app is dark by identity, so the emails match.
- **Cadmium red only on CTA + brand mark** — same rule as the app.
- **Line length capped at 560px** — reads well in preview panes.
- **All hex codes literal, no tokens** — email is a walled garden.

## Variables

Supabase Auth templates use Go template syntax. Available:

- `{{ .SiteURL }}` — the Site URL configured in URL Configuration
- `{{ .ConfirmationURL }}` — full link (magic link, recovery, invite)
- `{{ .Token }}` — 6-digit OTP (used in reauthentication template)
- `{{ .Email }}` — user's current email
- `{{ .NewEmail }}` — new email (change-email template)
- `{{ .Data.<field> }}` — user metadata

## Local preview

Every template is self-contained HTML — open in a browser to preview. Variables will show as literal `{{ ... }}` — that's expected. For rendered preview with test values, use Supabase's built-in "Send test email" once SMTP is configured.
