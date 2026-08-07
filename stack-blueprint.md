# Stack Blueprint — Nothing Superapp

> **Version:** v1 · **Date:** 2026-08-07 · **Status:** Locked
> **Source of truth:** this document. When decisions change, bump the version + add to the change log at the bottom.

## 1. Product summary

**Nothing Superapp** is a cross-platform utility-bundle app: one subscription that replaces a dozen $4.99 micro-SaaS utilities (calorie counter, gym routine, habit tracker, budget, timer, notes, sleep/water/steps). Cross-platform PWA-first with iOS + Android native shells via Capacitor as fast-follows. Styled in the Nothing OS aesthetic (OLED black grounds, cadmium-red accent, Doto + Space Grotesk + Space Mono type stack). The design system is locked at `nothing-superapp/design-system/styles.css`.

- **Primary target:** PWA (Next.js 16 + React 19)
- **Secondary targets:** iOS + Android via Capacitor 6 (shared codebase)
- **Budget:** Couple-beers ($15-20/mo) — free tiers everywhere except a custom domain (~$1/mo amortized) with margin for Claude Haiku calorie-parsing API calls
- **Team:** Solo · **Ship urgency:** This week (D1–D7 timeline per campaign brief)
- **Off-limits:** None declared. Design system pins the visual layer (nothing-superapp/design-system/styles.css must be the ONLY stylesheet).

## 2. Locked decisions

| Role | Pick | Alternate considered |
|---|---|---|
| Frontend framework | **Next.js 16 (App Router) + React 19 + Tailwind CSS v4** | SvelteKit (smaller bundle, but Capacitor + shadcn ecosystem is React-first) |
| Styling / components | **Design system's `styles.css` (Nothing tokens) + Tailwind v4 for one-off utility classes only** | Pure Tailwind (rejected — the locked design system is the source of truth for tokens; Tailwind is a helper, not the palette) |
| Client state | **TanStack Query (server state) + Zustand (client state)** | Redux Toolkit (rejected — overkill for solo dev; Zustand's 3KB API is enough) |
| Forms + validation | **React Hook Form + Zod (client validation) + shared Zod schemas server-side** | Formik (unmaintained-ish); TanStack Form (newer, ecosystem thinner) |
| Backend | **Next.js Route Handlers (co-located) for HTTP; Supabase Edge Functions for cron / webhooks** | Standalone Hono on Cloudflare Workers (rejected — adds a second deploy target and codebase split for no early gain; Route Handlers ship on the same Vercel deploy) |
| Database | **Supabase Postgres** | Neon (serverless Postgres with branching — better DX for feature-branch DBs, but no built-in auth/storage; Supabase's bundle wins for solo) |
| ORM / query | **Drizzle ORM** | Prisma (bundle size + slower cold starts); Supabase JS client raw (fine for CRUD, but Drizzle gives typed migrations + schema-in-code) |
| Auth | **Supabase Auth (Sign in with Apple + Google OAuth + email magic link)** | Clerk (better hosted UI but $25/mo above 10k MAU; Supabase is free forever at any user count) |
| Payments | **Stripe (PWA + web) + RevenueCat (iOS + Android native shells) — one entitlement surface via RevenueCat webhooks** | Stripe-only (rejected — Apple/Google mandate in-app purchase for consumable/subscription content in native shells; RevenueCat unifies) |
| Storage | **Supabase Storage (1 GB free) — for user-uploaded profile pics, meal photos, workout notes** | Cloudflare R2 (10 GB free, no egress) — cheaper at scale; Supabase Storage bundled wins for solo simplicity now |
| Email | **Resend (transactional: magic links, receipts, weekly summaries)** | Postmark (better deliverability, no free tier); Supabase built-in SMTP (rate-limited to 4/hr — insufficient) |
| Analytics | **PostHog Cloud (US-hosted for free tier) — product analytics + feature flags + session replay in ONE tool; SDKs: `posthog-js` on the PWA + `posthog-react-native` bridged through Capacitor; reverse-proxied through `/ingest` in Next.js to bypass ad-blockers** | Vercel Analytics (free but shallow — page views only); Plausible ($9/mo — privacy-first but no funnels, no feature flags, no replay); Google Analytics (privacy issues, poor DX) |
| Errors | **Sentry (5k events/mo free) — errors + performance + release tracking** | Highlight (session replay bundled); Vercel-built-in error tracking (surface-level) |
| Deploy (primary) | **Vercel Hobby (Free)** | Cloudflare Pages (free at scale + no egress fees; rejected because Next.js 16 App Router + Supabase adapter is smoother on Vercel today) |
| Native shell(s) | **Capacitor 6 (iOS + Android from the same Next.js build output)** | Expo React Native (rejected — would require a second codebase or a shared component library; Capacitor keeps ONE codebase for web + PWA + native) |
| CI/CD | **GitHub Actions (2k mins/mo free) + Vercel automatic PR previews + EAS Build for native (30 free builds/mo)** | CircleCI (overkill for solo) |
| Version control host | **GitHub (private repo)** | GitLab / Codeberg (rejected — GitHub Actions + gh CLI + issue-linked-PR ergonomics) |
| Package manager | **pnpm (fast, disk-efficient, native workspace support for the monorepo)** | npm (works, but pnpm's workspace + install speed matter for a Capacitor monorepo) |
| Domain strategy | **Custom domain via Vercel (~$10-15/yr from Cloudflare Registrar at cost)** | — |

## 3. Rationale

### Frontend + backend
Next.js 16 + Route Handlers gives us ONE codebase for the PWA UI AND the backend HTTP layer, deployed as a single Vercel project. This is the fastest path from 0 → live app with a real backend when solo. Alternative was splitting frontend (Next.js on Vercel) + backend (Hono on Cloudflare Workers) — rejected because it doubles deploy surfaces, splits type sharing, and adds an auth-across-origins problem for zero early-stage gain. Locked by: solo team, ship-this-week urgency, and the design system already pinning the frontend to React (via shadcn primitives).

### Database + auth
Supabase bundles Postgres + Auth + Storage + Realtime + Edge Functions in ONE dashboard with ONE JS client. For a solo dev shipping a consumer app in a week, that bundle beats any composable alternative. Postgres itself is the boring correct choice for structured data (users, workouts, meals, habit entries, transactions). Row-Level Security policies encode auth rules IN the database — no separate auth middleware needed for CRUD endpoints. Sign in with Apple + Google covers 95% of iOS/Android acquisition friction; magic link covers the rest. Locked by: solo team, free-tier constraint (Supabase Free supports unlimited MAU + 50k monthly active users), design system's dark aesthetic (auth UI theming works both directions via Supabase Auth UI or a custom shadcn form).

### Multi-target strategy
Capacitor 6 wraps the exact Next.js production build (`next build` → static export → Capacitor packages the `out/` folder into iOS + Android native projects). This means: ONE codebase, ONE design system, ONE auth flow, ONE analytics pipeline across web + PWA + iOS + Android. The trade-off is we can't use Next.js SSR for the native shells (Capacitor needs static output) — which is fine because the app is client-heavy anyway (utility tiles, offline-first data). Any true native affordance (HealthKit for steps, StoreKit for IAP fallback, Sign in with Apple's ASAuthorization API) goes through Capacitor plugins. React Native + Expo was the alternative — rejected because it would fork the codebase from the PWA, doubling the maintenance surface. Locked by: multi-target requirement, solo team.

### Hosting
Vercel Hobby covers the PWA at $0/mo up to 100 GB bandwidth / 100k daily function invocations — enough for the first 500-1000 signed-in DAU. First paid dollar is Vercel Pro at $20/mo, triggered by commercial-use policy (technically required for real products) OR sustained > 80% of the free bandwidth cap. Cloudflare Pages was the alternative — cheaper at scale (free egress forever), but the Next.js 16 App Router + Supabase auth adapter has slightly rougher edges on Cloudflare's runtime today. Migration path: if bandwidth becomes the bottleneck at 10k+ DAU, moving to Cloudflare Pages is a 2-4 hour job (mostly `next.config.ts` tweaks + swapping the Vercel deploy hook for Cloudflare's). We considered hosting the entire stack in Supabase for vendor consolidation — rejected because Supabase deliberately does NOT host arbitrary Next.js apps (they're backend-as-a-service; frontend hosting is your responsibility). The nearest consolidation move is Cloudflare-only (Pages + Workers + D1 + R2 + Access) which drops Supabase entirely — a real option but a 2-day rebuild we don't want during ship-week. Locked by: ship-this-week + $15-20/mo budget + solo-dev DX priorities.

### Payments
Consumer subscriptions on cross-platform apps mandate two payment rails: Stripe for the web/PWA (Apple/Google don't tax web payments), RevenueCat wrapping StoreKit + Google Play Billing for the native shells (Apple's 30% cut for years 1, 15% year 2+; Google similar). RevenueCat unifies entitlements — one call to `Purchases.getCustomerInfo()` returns the user's active subscription regardless of which store they bought through. Free-tier: RevenueCat is free up to $2.5k MTR (~$30k/yr revenue) — plenty for launch runway. Locked by: multi-target requirement.

### Analytics + observability
PostHog Cloud (US-hosted) chosen because it bundles product analytics + feature flags + session replay + funnels in ONE tool with a 1M events/mo free tier — three separate vendors' work at $0/mo. SDK strategy: `posthog-js` on the PWA + `posthog-react-native` bridged through Capacitor for iOS+Android, with the SAME project key so all three surfaces feed one dashboard. Reverse-proxied through Next.js (`/ingest/:path*` → `https://us.i.posthog.com/:path*`) to bypass ad-blockers that increasingly drop direct calls to third-party analytics domains — ~20-30% event loss recovery. First-week instrument list: `signup`, `tile_opened` (props: tile_name), `feature_first_used` (props: feature), `subscribe_button_clicked`, `subscribe_completed`, `streak_broken`, `session_length_over_5min`. Session replay ON by default with `input[type="password"]` masking + `data-ph-mask` selector for any PII fields (weight, address, phone). Feature flags used for gradual rollout of new tiles (`beta-nutrition-scanner`, `beta-workout-ai`). GDPR posture: US-hosted free tier is acceptable for launch (US-primary user base); move to EU-hosted (`eu.posthog.com`) if we get real EU traction pre-paid tier. Alternatives rejected: Vercel Analytics gives only page-view level data (no funnels, no replay); Plausible is privacy-first but has no flags or replay; Google Analytics has privacy problems + poor DX. Locked by: solo team wanting one tool for analytics + flags + replay.

## 4. Cost envelope

**Budget target: ~$15-20/mo ("couple beers")** — genuinely runnable on free tiers + a domain + a bit of AI usage.

| Users (DAU) | Monthly cost | What's paid |
|---|---|---|
| 0-100 | **~$1/mo** | Domain amortized (~$12/yr). Everything else free. |
| 100-500 | **~$5-15/mo** | Domain + Claude Haiku usage for calorie parsing (~$0.01/user/day at 3 meal parses). |
| 500-1k | **~$10-20/mo** | Approaching Vercel Hobby limits; still free-tier compliant but consider pre-emptive Vercel Pro for commercial-use policy. |
| 1k-5k | **~$45-70/mo** | Vercel Pro ($20) + Supabase Pro ($25) + Claude Haiku usage scales linearly. |
| 5k-10k | **~$100-150/mo** | Above + Sentry Team ($26), maybe Resend Pro ($20). |
| 10k-50k | **~$200-400/mo** | Add PostHog usage tier, RevenueCat 1% fee kicks in at $2.5k MTR. |
| 50k+ | Real infra conversation | Move DB compute up (Supabase Team) or migrate to Neon Scale; Cloudflare R2 for media. |

**Free-tier ceilings (cite the actual numbers that gate the upgrade):**
- **Vercel Hobby:** 100 GB bandwidth / mo, 100k function invocations / day, 1k Middleware invocations / day. Sustained > 80% = upgrade signal.
- **Supabase Free:** 500 MB Postgres, 5 GB egress / mo, 1 GB storage, 50k monthly active users (Auth), 2 projects (paused after 7d inactivity — fine for MVP, resume is auto).
- **Resend Free:** 3k emails / mo, 1 sending domain.
- **Sentry Free:** 5k errors + 10k performance events / mo.
- **PostHog Free:** 1M events / mo, 15k session replays.
- **GitHub Actions Free:** 2k minutes / mo (private repos), unlimited (public).
- **EAS Build Free:** 30 native builds / mo.
- **RevenueCat Free:** $2.5k MTR / mo tracked revenue.

**First paid dollar triggers:**
- Vercel bandwidth > 80 GB/mo → **Vercel Pro $20/mo** (also covers commercial-use policy).
- Supabase egress > 4 GB/mo cumulative → **Supabase Pro $25/mo**.
- Sentry errors > 4k/mo → **Sentry Team $26/mo**.
- Resend emails > 2.5k/mo → **Resend Pro $20/mo**.
- RevenueCat tracked revenue > $2.5k/mo → **RC paid 1% fee**.
- EAS Build > 25/mo → **EAS Priority $19/mo** (bigger queue + priority build slots).

## 5. Folder structure

### Primary: PWA (Next.js 16 + React 19)
```
nothing-superapp/
├── apps/
│   └── web/                          # Next.js 16 PWA + Capacitor host
│       ├── src/
│       │   ├── app/                  # App Router
│       │   │   ├── (marketing)/      # public: landing + pricing + login
│       │   │   ├── (app)/            # authenticated: home grid + each tile
│       │   │   │   ├── calorie/
│       │   │   │   ├── gym/
│       │   │   │   ├── habits/
│       │   │   │   ├── budget/
│       │   │   │   ├── timer/
│       │   │   │   ├── notes/
│       │   │   │   └── sleep-water-steps/
│       │   │   ├── api/              # Route Handlers
│       │   │   │   ├── auth/[...supabase]/route.ts
│       │   │   │   ├── webhooks/stripe/route.ts
│       │   │   │   └── webhooks/revenuecat/route.ts
│       │   │   ├── globals.css       # imports ../../../packages/design-system/styles.css
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   │   ├── ui/               # shadcn primitives, restyled to design system tokens
│       │   │   └── features/         # per-tile components
│       │   ├── lib/                  # db.ts (Drizzle), auth.ts (Supabase), stripe.ts, rc.ts
│       │   ├── stores/               # Zustand
│       │   ├── hooks/
│       │   ├── drizzle/schema/       # one file per table
│       │   └── types/
│       ├── public/                   # PWA manifest, icons, service worker
│       ├── capacitor.config.ts       # points at Next.js static export output
│       ├── ios/                      # generated by `npx cap add ios`
│       ├── android/                  # generated by `npx cap add android`
│       ├── next.config.ts            # output: 'export' for Capacitor build; toggle in dev
│       └── package.json
├── packages/
│   ├── design-system/                # from design-system-builder → nothing-superapp/design-system/
│   ├── shared/                       # Zod schemas, TS types, shared client
│   │   ├── src/
│   │   │   ├── schemas/              # userSchema, mealSchema, workoutSchema (client + server)
│   │   │   ├── types/                # shared TS types
│   │   │   └── api-client/           # typed fetcher
│   │   └── package.json
│   └── config/                       # tsconfig-base, eslint-base, prettier-base
├── docs/
│   ├── architecture/
│   │   ├── stack-blueprint.md        # ← THIS FILE
│   │   └── prd.md
│   └── runbooks/
├── services/growth/                  # already exists — social/marketing operations
├── .github/workflows/
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### Secondary: iOS + Android (Capacitor)

Capacitor generates its own `ios/` and `android/` folders inside `apps/web/`. These are Xcode + Android Studio projects respectively — they compile the same Next.js `out/` static export as their web root, with Capacitor plugins providing native bridges.

```
apps/web/
├── ios/App/
│   ├── App.xcworkspace
│   ├── App/Info.plist          # bundle id, capabilities, HealthKit + Sign in with Apple entitlements
│   └── Podfile                 # RevenueCat + HealthKit plugins
└── android/
    ├── app/build.gradle        # min SDK, signing config
    ├── app/src/main/AndroidManifest.xml
    └── gradle/                 # Kotlin build system
```

We don't hand-edit these — they're regenerated on major Capacitor upgrades. Native-only Swift/Kotlin code goes in `ios/App/App/Plugins/*.swift` and `android/app/src/main/java/*/plugins/*.kt` respectively, only when a Capacitor plugin doesn't cover our need.

**Naming conventions:**
| Element | Convention | Example |
|---|---|---|
| Routes (Next.js) | file name = URL segment | `app/(app)/calorie/page.tsx` |
| Route groups | `(name)` — no URL impact | `app/(marketing)/` |
| Components | PascalCase.tsx | `CalorieTile.tsx` |
| Hooks | camelCase.ts, `use` prefix | `useCalorieEntries.ts` |
| Helpers / utils | kebab-case.ts | `format-macros.ts` |
| Drizzle tables | plural snake_case | `calorie_entries.ts` |
| Zod schemas | camelCase, `Schema` suffix | `mealSchema` |
| Stripe products | kebab-case | `nothing-superapp-monthly` |
| CSS classes (from design system) | already defined in styles.css | `.btn-primary`, `.card`, `.fab` |
| Test files | `*.test.ts` colocated | `format-macros.test.ts` |

## 6. What's shared vs per-target

### Shared across PWA + iOS + Android (in `packages/shared/`)
- **Zod schemas** — client validates before POST, server re-validates on receipt. One source, two enforcement points.
- **TypeScript types** — user, subscription, meal, workout, habit, transaction, note. Every layer imports from here.
- **API client** — typed fetcher wrapper over `fetch` (or Supabase JS client). Same call sites everywhere.
- **Design tokens** — `packages/design-system/styles.css` linked from the Next.js `app/globals.css`. Every screen uses `var(--color-*)`, `var(--font-*)`, etc.

### Per-target (in `apps/web/src/` behind Capacitor platform-checks)
- **HealthKit read for sleep/water/steps** — Capacitor plugin only fires on iOS/Android; PWA falls back to manual entry.
- **StoreKit / Play Billing** — RevenueCat wrapper only initializes on native shells; PWA uses Stripe Checkout instead.
- **Sign in with Apple** — native uses ASAuthorization (SwiftUI bridge); PWA uses Supabase OAuth redirect flow.
- **Push notifications** — Capacitor plugin + APNs/FCM on native; Web Push API on PWA.

All of the above are gated with `Capacitor.getPlatform() === 'ios' | 'android' | 'web'` checks so the ONE codebase compiles cleanly to every target.

## 7. Scaffold commands

Run these in order from a fresh directory:

```bash
# Assumes: Node 22+, pnpm 9+, macOS or Linux for iOS builds (Xcode) / Windows OK for Android + web

# 1. Monorepo scaffold
mkdir -p apps packages/{shared,config}
pnpm init
cat > pnpm-workspace.yaml <<EOF
packages:
  - "apps/*"
  - "packages/*"
EOF

# 2. Web app (Next.js 16 PWA)
cd apps
pnpm create next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm
cd web
pnpm add @supabase/supabase-js @supabase/ssr drizzle-orm postgres @tanstack/react-query zustand react-hook-form zod stripe
pnpm add -D drizzle-kit @types/node

# 3. shadcn/ui — bring in the primitives we'll restyle to Nothing tokens
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input dialog form tabs

# 4. Link the design system
ln -s ../../design-system ../../packages/design-system
echo '@import "../../../packages/design-system/styles.css";' > src/app/design-system.css
# then import ./design-system.css from src/app/layout.tsx before globals.css

# 5. Capacitor for native shells
pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
pnpm add @revenuecat/purchases-capacitor @capacitor-community/health
pnpm exec cap init "Nothing Superapp" "com.nothingsuperapp.app" --web-dir=out
# Adjust next.config.ts: `output: 'export'` for the Capacitor build script only

# 6. iOS + Android platforms (run on the host that has Xcode / Android Studio)
pnpm exec cap add ios     # requires Xcode
pnpm exec cap add android # requires Android Studio

# 7. Supabase local dev
cd ../..
pnpm dlx supabase init
pnpm dlx supabase start
# copies keys into apps/web/.env.local automatically

# 8. Shared packages
cd packages/shared && pnpm init && pnpm add zod
cd ../config && pnpm init  # add tsconfig-base, eslint-base, prettier-base configs

# 9. GitHub repo + CI
gh repo create nothing-superapp/nothing-superapp --private --source=. --push
# add .github/workflows/ci.yml with typecheck + lint + test

# 10. Vercel + Supabase connect
pnpm dlx vercel link
# link Vercel project → auto-deploys apps/web on push to main, previews per PR

# 11. Domain
# Register at Cloudflare Registrar (at-cost pricing), point NS to Vercel, add domain in Vercel dashboard
```

## 8. Trade-offs accepted

- **Vercel over Cloudflare Pages** — we accept the ~10% higher cost at scale in exchange for a smoother Next.js 16 + Supabase deploy today. Migration path is documented (2-4 hour move when bandwidth crosses ~500 GB/mo).
- **Supabase all-in-one over composable (Neon + Clerk + Cloudflare R2)** — we accept vendor concentration (one dashboard, one billing relationship) in exchange for solo-dev ergonomic wins (one auth session, one SDK, one migration story). If we grow past 100k MAU we may split — but not before.
- **Capacitor over Expo (React Native)** — we accept slightly-less-native feel (WebViews under the hood) in exchange for ONE codebase across web + PWA + iOS + Android. This is a genuine trade — die-hard native folks will point at animations and input latency. For our utility bundle where each tile is CRUD-shaped, this is fine.
- **Drizzle over Prisma** — we accept fewer prebuilt migration niceties in exchange for faster cold starts and SQL-shaped queries (easier to reason about than Prisma's abstracted query builder).
- **PostHog over Vercel Analytics + separate feature flags service** — we accept a slightly higher event budget in exchange for one dashboard for analytics + flags + replays.
- **pnpm over npm** — the monorepo workspace tooling matters; the ~5% team-familiarity ramp is worth it.
- **Free tier as first-class ship** — we accept that Supabase Free projects pause after 7 days inactivity. Fine for MVP; the auto-resume + 5-10s cold start is acceptable for launch-week users. First paid dollar goes to Supabase Pro the moment we have consistent daily traffic.

## 9. Migration paths

If the app takes off, here's how to graduate from the free tier without a rewrite:

### If we hit Vercel bandwidth ceiling (~80 GB/mo)
1. Upgrade to **Vercel Pro ($20/mo)** — bandwidth goes to 1 TB, function invocations to 1M/day. Fixes 95% of cases.
2. If still constrained at 500 GB+/mo, migrate to **Cloudflare Pages** — 2-4 hours of work. Move Next.js adapter to `@cloudflare/next-on-pages`, migrate Route Handlers to Cloudflare Workers, keep Supabase (compatible from Workers).

### If we hit Supabase egress ceiling (5 GB/mo)
1. Upgrade to **Supabase Pro ($25/mo)** — unlimited egress, 8 GB DB. Fixes 95% of cases.
2. If DB grows past ~50 GB, evaluate **Neon Scale** ($69/mo, better serverless economics) or **Fly Postgres** (self-managed, cheaper at scale).
3. For media/blob storage growth, migrate uploads to **Cloudflare R2** (free 10 GB, no egress fees) — Supabase Storage stays for anything with row-level-security requirements.

### If we outgrow Supabase Auth (~50k MAU cap on free)
1. Move to **Supabase Pro** (unlimited MAU included).
2. If we need SSO / SAML / directory sync later (B2B pivot), evaluate **WorkOS** for those specific tenants without moving off Supabase Auth for consumer accounts.

### If Capacitor's WebView feel becomes a real limiter
1. Introduce **React Native + Expo** for the ONE screen that needs it (e.g. camera-heavy AR meal tracker), consumed as a Capacitor Custom Element in the native shell. Selective escape hatch.
2. Full RN migration is a 4-6 week job — only if user testing reports significant native-vs-web friction.

### If solo becomes a team of 3+
1. Split `apps/web/src/app/(app)/` into feature packages under `packages/features/*` with clearer ownership.
2. Introduce **Turborepo** for task orchestration if `pnpm --filter` becomes slow.
3. Enable branch preview envs on Supabase (available on Pro).

## 10. Next steps

1. **Do § 11 first — accounts + env vars + config.** Estimated 90-120 min if starting from zero (Apple Developer takes 24-48h to approve — start it TODAY).
2. **Bootstrap:** run § 7 scaffold commands in order. Expect ~30 min for the monorepo + web app + Capacitor + Supabase local. Native platforms add ~15 min each (Xcode/Android Studio waiting).
3. **Wire the design system:** confirm `packages/design-system/styles.css` imports cleanly from `apps/web/src/app/layout.tsx` before styling any screen.
4. **Model the DB:** write Drizzle schemas for `users`, `subscriptions`, `meals`, `workouts`, `habit_entries`, `notes`, `transactions` — one PR each, keep them small.
5. **Hand off to `/swarm-dev`** for the actual tile implementations. Per campaign timeline (D2–D3), each tile gets its own `/swarm-dev` invocation.
6. **Wire billing after auth works:** Stripe products + RevenueCat entitlements + webhook endpoints.
7. **Deploy PWA to Vercel:** `pnpm dlx vercel --prod` after the home grid + auth + one working tile land — that's the MVP shape needed to start capturing signups.

> **Handoff line for the next agent:**
> ✅ Stack locked. Complete § 11 Prerequisites, then hand this blueprint + `packages/design-system/styles.css` to `/swarm-dev` for tile implementation.

## 11. Prerequisites & Access — before you build

Complete this checklist **before** running the scaffold commands in § 7. Missing any of these will block you mid-scaffold and cost 20-60 minutes each to unblock.

### 11a. Accounts to create

| Service | Signup URL | Payment method at signup? | Free tier ceiling | Why we need it |
|---|---|---|---|---|
| **GitHub** | https://github.com/join | No | 1 private repo, 2k Actions mins/mo | Repo hosting, CI, gh CLI |
| **Vercel** | https://vercel.com/signup (sign in with GitHub) | No | Hobby: 100 GB bandwidth/mo, 100k func invocations/day | Deploy PWA |
| **Supabase** | https://supabase.com/dashboard/sign-in (GitHub) | No | 500 MB DB, 5 GB egress, 1 GB storage, 50k MAU | Postgres + Auth + Storage + Edge Functions |
| **Stripe** | https://dashboard.stripe.com/register | No for test mode; yes for live | No monthly fee; 2.9% + 30¢/transaction | Web/PWA subscription payments |
| **RevenueCat** | https://app.revenuecat.com/signup | No | Free up to $2.5k MTR/mo | iOS + Android IAP entitlement unification |
| **Apple Developer** | https://developer.apple.com/programs/enroll/ | **Yes — $99/yr** | — | App Store + Sign in with Apple + StoreKit. Approval 24-48h — START TODAY. |
| **Google Play Console** | https://play.google.com/console/signup | **Yes — $25 one-time** | — | Play Store + Play Billing |
| **Google Cloud Console** | https://console.cloud.google.com/ | No (for OAuth only) | Free | OAuth 2.0 credentials for Sign in with Google |
| **Resend** | https://resend.com/signup | No | 3k emails/mo, 100/day, 1 domain | Magic links, receipts, weekly summaries |
| **PostHog Cloud** | https://us.posthog.com/signup | No | 1M events/mo, 15k session replays | Analytics + flags + replays |
| **Sentry** | https://sentry.io/signup/ | No | 5k errors + 10k perf + 500 replays/mo | Error tracking |
| **Cloudflare** | https://dash.cloudflare.com/sign-up | Yes for domain purchase (~$10-15/yr at-cost) | Free account + at-cost domains | Domain registrar + DNS |
| **Anthropic** | https://console.anthropic.com/ | Yes for prod usage (pay-as-you-go) | Free credit for testing | Claude Haiku for calorie parsing |

**Order to create:** GitHub → Vercel → Supabase → Cloudflare (domain) → Apple Developer (long approval — do first) → Google Play → Google Cloud OAuth → Stripe → RevenueCat (needs Apple + Google done first) → Resend → PostHog → Sentry → Anthropic.

### 11b. Environment variables

Every key the app needs in `.env.local` (dev) and Vercel/hosting environment variables (prod). Never commit these; keep `.env.example` in the repo with placeholder values.

All values below go in `apps/web/.env.local` for dev, and mirrored in **Vercel → Project Settings → Environment Variables** for prod (mark production + preview + development scopes). Keep `apps/web/.env.example` in git with placeholder values (never the real ones).

| Env var | Source | Client/Server | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Both | Format: `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Both | Safe in client — RLS enforces auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | **Server only** | Bypasses RLS. Never expose to client. |
| `DATABASE_URL` | Supabase → Project Settings → Database (connection string) | Server | Used by Drizzle migrations |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | Server | Starts `sk_test_` or `sk_live_` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys | Both | Starts `pk_test_` or `pk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint | Server | Starts `whsec_`. Set AFTER first deploy. |
| `NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY` | RevenueCat → App Settings → API keys (iOS) | Client | For native iOS shell |
| `NEXT_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | RevenueCat → App Settings → API keys (Android) | Client | For native Android shell |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat → Project Settings → Integrations → Webhooks | Server | Validates incoming webhooks |
| `RESEND_API_KEY` | Resend → API keys | Server | Starts `re_` |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog → Project Settings → Project API Key | Client | Public key, safe |
| `NEXT_PUBLIC_POSTHOG_HOST` | Static | Client | `https://us.i.posthog.com` (or eu equivalent) |
| `SENTRY_DSN` | Sentry → Project Settings → Client Keys | Both | Public DSN |
| `SENTRY_AUTH_TOKEN` | Sentry → User Settings → Auth Tokens | Server (CI only) | For source-map uploads |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ → Workspace → API Keys | Server | Starts `sk-ant-` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials | Server (Supabase Auth config) | Paste into Supabase Auth → Providers → Google |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same | Server (Supabase Auth config) | Same |
| `APPLE_TEAM_ID` | developer.apple.com → Membership | Server (Supabase Auth config) | 10-char team ID |
| `APPLE_KEY_ID` | developer.apple.com → Keys | Server (Supabase Auth config) | 10-char key ID |
| `APPLE_PRIVATE_KEY` | developer.apple.com → Keys → .p8 file contents | Server (Supabase Auth config) | Paste as-is including BEGIN/END lines |
| `APPLE_CLIENT_ID` | Services ID reverse-DNS from Apple Developer | Server (Supabase Auth config) | e.g. `com.nothingsuperapp.web` |

**Committed to git:** `apps/web/.env.example` (with placeholder values). **Never committed:** `apps/web/.env.local` (real values).

### 11c. Local dev prerequisites

Hardware, OS, and installed software required before `pnpm install` will work end-to-end.

| Tool | Min version | Install | Required for |
|---|---|---|---|
| **Node.js** | 22 LTS | https://nodejs.org (or `fnm install --lts`) | Everything |
| **pnpm** | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` | Monorepo workspaces |
| **Git** | 2.40+ | System-provided or https://git-scm.com/ | Version control |
| **GitHub CLI (gh)** | 2.40+ | https://cli.github.com/ | Repo creation from CLI, PR management |
| **Vercel CLI** | latest | `pnpm dlx vercel` | Deploy + env var management from terminal |
| **Supabase CLI** | latest | `pnpm dlx supabase` | Local DB, migrations, type generation |
| **Xcode** | 16+ | Mac App Store (macOS only) | iOS builds via Capacitor |
| **Android Studio** | Ladybug+ | https://developer.android.com/studio | Android builds via Capacitor |
| **CocoaPods** | 1.15+ | `sudo gem install cocoapods` (Ruby-based, comes with macOS) | Capacitor iOS dependencies |
| **Java 21** | 21 LTS | `brew install openjdk@21` on macOS | Required by Android Gradle plugin |
| **Docker Desktop** | latest | https://docker.com/products/docker-desktop | Optional — for local Supabase container |

**Recommended:** iOS simulator installed via Xcode + one Android emulator via Android Studio's Device Manager. For HealthKit / HealthConnect testing you need real hardware.

**macOS is required for iOS builds** — Windows + Linux can develop the web + Android sides fine but need a Mac (or Xcode Cloud) to compile iOS.

### 11d. Configuration steps before scaffold

One-time setup in each service's dashboard, done AFTER creating accounts but BEFORE running scaffold commands.

Do these AFTER creating accounts, BEFORE running scaffold commands in § 7. Steps that depend on others are ordered accordingly.

**1. Domain — Cloudflare Registrar**
- Register `nothingsuperapp.com` (or preferred TLD) via Cloudflare Registrar.
- Do NOT change nameservers yet — Vercel will guide you when you add the domain to the project post-deploy.

**2. Apple Developer — start the long-lead items**
- Enroll in Apple Developer Program ($99/yr). **Approval takes 24-48 hours — do this FIRST.**
- While waiting: also enroll in Google Play Console ($25 one-time).

**3. Supabase project setup**
- Create new project. Pick region closest to primary users (US-East for launch).
- Under **Auth → Providers**: enable Email (magic link) + Google + Apple. Leave Google/Apple keys blank for now (fill in after step 5).
- Note the callback URL Supabase shows for Google/Apple (looks like `https://xyz.supabase.co/auth/v1/callback`).
- Copy `URL` + `anon key` + `service_role key` + `Database URL` → paste into `.env.local` template (see § 11b).

**4. Google OAuth (for Sign in with Google via Supabase)**
- Google Cloud Console → create project → APIs & Services → OAuth consent screen → configure external app (name, support email, logo).
- Credentials → Create OAuth Client ID → Web application.
- **Authorized redirect URIs**: paste the Supabase callback URL from step 3. Also add `http://localhost:3000/api/auth/callback` for local dev.
- Copy Client ID + Client Secret → paste into Supabase Auth → Providers → Google.

**5. Apple Sign in setup (once Apple approves in step 2)**
- developer.apple.com → Identifiers → Register a new App ID (bundle ID `com.nothingsuperapp.app`) + enable "Sign in with Apple" capability.
- Register a Services ID (reverse-DNS, e.g. `com.nothingsuperapp.web`) → enable Sign in with Apple → add the Supabase callback URL from step 3.
- Keys → Create key for "Sign in with Apple" → download the .p8 file (one-time only). Note the Key ID.
- Paste into Supabase Auth → Providers → Apple: Services ID (`APPLE_CLIENT_ID`), Team ID (from Membership page), Key ID, .p8 contents.

**6. Stripe products**
- Dashboard → Products → Create product `Nothing Superapp Subscription` with two prices: `$4.99/mo` recurring monthly + `$39.99/yr` recurring yearly.
- Note the two `price_*` IDs — hardcode into `apps/web/src/lib/stripe.ts` product map.
- Enable Apple Pay + Google Pay for PWA checkout under Payment Methods.
- Webhook endpoint config comes AFTER first deploy (post § 7).

**7. RevenueCat setup (once App Store + Play Console apps exist from step 5 + Google Play enrollment)**
- RevenueCat → Create project → add iOS app (bundle ID from step 5) + Android app (package name).
- Products: create two products matching Stripe (`monthly_499` + `annual_3999`) — do this in App Store Connect + Play Console FIRST, then RevenueCat imports them automatically.
- Entitlement: create `premium` → attach both iOS + Android products.
- Copy iOS + Android API keys → `.env.local`.
- Webhook secret + endpoint config comes AFTER first deploy.

**8. Resend sending domain**
- Add domain `mail.nothingsuperapp.com` (subdomain recommended over root).
- Add DNS records shown (SPF + DKIM) to Cloudflare DNS. TTL propagation up to 24h.
- Verify status turns green before shipping any signup that sends email.
- Create API key → `.env.local`.

**9. PostHog setup**
- Create project → note the API key.
- Under project settings → enable session recording → mask `input[type="password"]` + any custom `data-ph-mask` selectors.
- (Recommended) prepare the reverse-proxy: in `apps/web/next.config.ts` add a `rewrites()` function mapping `/ingest/:path*` → `https://us.i.posthog.com/:path*`. Then `posthog.init(key, { api_host: '/ingest' })` in the client init.

**10. Sentry Next.js wizard**
- Sentry → New Project → Next.js. Copy the DSN.
- After scaffold: `npx @sentry/wizard@latest -i nextjs` — writes `sentry.client.config.ts` + `sentry.server.config.ts` automatically.
- Add `SENTRY_AUTH_TOKEN` to GitHub Actions secrets for CI source-map uploads.

**11. Anthropic API key**
- Console → API Keys → create workspace + key.
- Set spend limit ($20/mo for safety) — prevents runaway costs on the calorie-parsing endpoint.
- Enable prompt caching for the calorie-parsing system prompt (cache hits are 10% of standard cost).

**Confirmation gate:** you're ready to run § 7 scaffold when every checkbox above is green + `apps/web/.env.local` has real values (not placeholders) for all keys in § 11b.

---

## Change log

| Version | Date | What changed | Why |
|---|---|---|---|
| v1 | 2026-08-07 | Initial blueprint | Green-field decision from stack-architect |
