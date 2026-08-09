# BLOCKED — human action required

## Vercel env vars for Web Push (v0.3.2)

The Vercel CLI is not installed on this machine, so the env vars below
could not be pushed automatically. **Web Push will not work in
production until these are set.** GitHub secrets are already in place.

### What to run

```sh
# 1. Install the CLI + log in (once):
npm i -g vercel
vercel login   # jmadrazo7@gmail.com

# 2. Link the project (from the monorepo root — project has Root
#    Directory `apps/web` in Vercel):
cd apps/web
vercel link    # pick the existing "nothing-superapp" project

# 3. Push each var to all three environments. Value shown on the right.
#    (Copy from apps/web/.env.local — same values.)
for env in production preview development; do
  printf '%s\n' 'lC-JfufHz4ZP3SrnjuT4RNR2Ykb70vhl41ccrKKLKsM' \
    | vercel env add VAPID_PRIVATE_KEY $env
  printf '%s\n' 'mailto:jmadrazo7@gmail.com' \
    | vercel env add VAPID_SUBJECT $env
  printf '%s\n' 'jmadrazo7@gmail.com' \
    | vercel env add ADMIN_USER_EMAILS $env
  printf '%s\n' '9deaa3e07e4b7e245e4b26738a8254f240049dc14d6a0b6dc57392395766504f' \
    | vercel env add ADMIN_BROADCAST_SECRET $env
done

# 4. Trigger a redeploy so the new env is picked up:
vercel --prod
```

### Verification after you set them

```sh
# 1. Log in to https://nothing-superapp.vercel.app.
# 2. Go to Settings → Preferences → Push notifications → Turn on.
# 3. Accept the browser prompt. A subscription row lands in
#    Supabase `push_subscriptions`.
# 4. Hit "Send test" — a system notification appears within ~1s.
# 5. Bump `apps/web/src/lib/version.ts` → APP_VERSION on the next
#    release and push to main; the `broadcast-on-version-bump`
#    GitHub Action fires and fans out to all opt-ins.
```

### What is NOT blocked

Everything else has shipped and is production-usable the moment the
Vercel env vars land:

- Supabase migration 009 applied (push_subscriptions, push_deliveries,
  push_broadcasts, preferences.push_enabled + push_topics).
- GitHub secrets set (VAPID_PRIVATE_KEY, VAPID_SUBJECT,
  ADMIN_USER_EMAILS, ADMIN_BROADCAST_SECRET).
- `.github/workflows/broadcast-on-version-bump.yml` will fire the
  release broadcast as soon as APP_VERSION next changes.
- Local `pnpm build` is green — same code is what Vercel builds.
