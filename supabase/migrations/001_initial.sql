-- Nothing Superapp — initial schema (spec_version 2, 2026-08-07)

-- Core user tables (Supabase Auth auto-creates auth.users)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'EN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default false,
  theme text not null default 'dark',
  daily_calorie_goal int, -- reference mini-app carry-over
  updated_at timestamptz not null default now()
);

create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null, -- trialing | active | past_due | canceled | incomplete
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Event bus (append-only, mini-apps write, others subscribe via realtime)
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, -- e.g. 'calorie.entry.added'
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index events_user_kind_created on events(user_id, kind, created_at desc);

-- Reference mini-app: calorie-lite (~200 LOC to prove plumbing)
create table app_calorie_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entered_at timestamptz not null default now(),
  meal text not null, -- breakfast|lunch|dinner|snacks
  raw_input text, -- optional: what user typed
  kcal int not null,
  protein_g int not null default 0,
  carbs_g int not null default 0,
  fat_g int not null default 0
);
create index app_calorie_entries_user_time on app_calorie_entries(user_id, entered_at desc);

-- Enable Row Level Security on every table
alter table profiles enable row level security;
alter table preferences enable row level security;
alter table subscriptions enable row level security;
alter table events enable row level security;
alter table app_calorie_entries enable row level security;

-- RLS policies — owner-only access via auth.uid()
-- profiles + preferences are keyed on the user id directly (id / user_id = auth.uid())

create policy profiles_owner_all on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy preferences_owner_all on preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- subscriptions: owner can read/write their own row (client reads status),
-- webhooks bypass RLS via the service role key (implicit) — plus explicit policy for clarity.
create policy subscriptions_owner_all on subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy subscriptions_service_role_all on subscriptions
  for all
  to service_role
  using (true)
  with check (true);

create policy events_owner_all on events
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy app_calorie_entries_owner_all on app_calorie_entries
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
