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

-- Server-side RPC: read current state as one JSON payload.
create or replace function public.get_app_state(p_id text default 'global')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.app_state%rowtype;
begin
  select *
  into row_data
  from public.app_state
  where id = p_id;

  if not found then
    return jsonb_build_object(
      'payout_history', jsonb_build_object('hr', jsonb_build_array(), 'sf', jsonb_build_array(), 'mp', jsonb_build_array(), 'af', jsonb_build_array(), 'inf', jsonb_build_array(), 'mpy', jsonb_build_array()),
      'division_passwords', jsonb_build_object('hr', '', 'sf', '', 'mp', '', 'af', '', 'inf', '', 'mpy', ''),
      'deleted_ids', jsonb_build_array(),
      'lastModified', now()
    );
  end if;

  return jsonb_build_object(
    'payout_history', coalesce(row_data.payout_history, '{}'::jsonb),
    'division_passwords', coalesce(row_data.division_passwords, '{}'::jsonb),
    'deleted_ids', coalesce(row_data.deleted_ids, '[]'::jsonb),
    'lastModified', row_data.last_modified
  );
end;
$$;

-- Server-side RPC: upsert full state payload and return normalized response.
create or replace function public.upsert_app_state(
  p_id text default 'global',
  p_payout_history jsonb default '{}'::jsonb,
  p_division_passwords jsonb default '{}'::jsonb,
  p_deleted_ids jsonb default '[]'::jsonb,
  p_last_modified timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.app_state%rowtype;
begin
  insert into public.app_state (id, payout_history, division_passwords, deleted_ids, last_modified)
  values (
    p_id,
    coalesce(p_payout_history, '{}'::jsonb),
    coalesce(p_division_passwords, '{}'::jsonb),
    coalesce(p_deleted_ids, '[]'::jsonb),
    coalesce(p_last_modified, now())
  )
  on conflict (id)
  do update set
    payout_history = excluded.payout_history,
    division_passwords = excluded.division_passwords,
    deleted_ids = excluded.deleted_ids,
    last_modified = excluded.last_modified
  returning * into row_data;

  return jsonb_build_object(
    'payout_history', coalesce(row_data.payout_history, '{}'::jsonb),
    'division_passwords', coalesce(row_data.division_passwords, '{}'::jsonb),
    'deleted_ids', coalesce(row_data.deleted_ids, '[]'::jsonb),
    'lastModified', row_data.last_modified
  );
end;
$$;

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

revoke all on function public.get_app_state(text) from public;
revoke all on function public.upsert_app_state(text, jsonb, jsonb, jsonb, timestamptz) from public;
grant execute on function public.get_app_state(text) to service_role;
grant execute on function public.upsert_app_state(text, jsonb, jsonb, jsonb, timestamptz) to service_role;

insert into public.app_state (id, payout_history, division_passwords, deleted_ids, last_modified)
values ('global',
  '{"hr":[],"sf":[],"mp":[],"af":[],"inf":[],"mpy":[]}'::jsonb,
  '{"hr":"","sf":"","mp":"","af":"","inf":"","mpy":""}'::jsonb,
  '[]'::jsonb,
  now()
)
on conflict (id) do nothing;
