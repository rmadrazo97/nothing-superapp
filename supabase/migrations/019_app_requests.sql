-- Migration 019 — REQUEST APP feature (v0.5.1).
--
-- Ships a lightweight "request a mini-app" surface on the launcher.
-- Users can drop a one-line ask ("photo diary", "budget tracker",
-- "sleep coach") and it lands in this table. Alex reviews the queue
-- weekly and either schedules the build or writes back "no plans yet".
--
-- No SELECT policy — end-users can only INSERT their own row; reads are
-- performed with the Supabase service role from the Studio dashboard.
-- Rate-limit is enforced at the API layer (5 requests/day/user via
-- lib/rate-limit.ts).

create table if not exists app_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists app_requests_created_at_idx
  on app_requests (created_at desc);

alter table app_requests enable row level security;

-- Users may INSERT rows only under their own user_id.
do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'app_requests'
       and policyname = 'app_requests_owner_insert'
  ) then
    create policy app_requests_owner_insert
      on app_requests
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- No SELECT / UPDATE / DELETE policies — reads happen via the service
-- role in the Supabase Studio, writes only via the API's INSERT above.
