-- Supabase schema for Auszahlung panel (single-row app state)
create table if not exists public.app_state (
  id text primary key,
  payout_history jsonb not null default '{}'::jsonb,
  division_passwords jsonb not null default '{}'::jsonb,
  deleted_ids jsonb not null default '[]'::jsonb,
  last_modified timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

alter table public.app_state enable row level security;

-- Secure server mode: deny direct client reads/writes by default.
drop policy if exists "app_state_no_client_select" on public.app_state;
create policy "app_state_no_client_select"
  on public.app_state
  for select
  to anon, authenticated
  using (false);

drop policy if exists "app_state_no_client_insert" on public.app_state;
create policy "app_state_no_client_insert"
  on public.app_state
  for insert
  to anon, authenticated
  with check (false);

drop policy if exists "app_state_no_client_update" on public.app_state;
create policy "app_state_no_client_update"
  on public.app_state
  for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "app_state_no_client_delete" on public.app_state;
create policy "app_state_no_client_delete"
  on public.app_state
  for delete
  to anon, authenticated
  using (false);

insert into public.app_state (id, payout_history, division_passwords, deleted_ids, last_modified)
values ('global',
  '{"hr":[],"sf":[],"mp":[],"af":[],"inf":[],"mpy":[]}'::jsonb,
  '{"hr":"","sf":"","mp":"","af":"","inf":"","mpy":""}'::jsonb,
  '[]'::jsonb,
  now()
)
on conflict (id) do nothing;
