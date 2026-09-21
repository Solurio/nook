-- Maps people make for WAR -- a world of their own, with its continents,
-- territories, borders and picture, and the rules they like to play it by --
-- kept for everyone. Any visitor can read every map and play on it in any
-- room; only whoever made one can change it or take it away, and anyone can
-- copy it and make it their own.

create table if not exists public.war_maps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author      text not null default '' check (char_length(author) <= 40),
  name        text not null check (char_length(name) between 1 and 60),
  world       jsonb not null check (jsonb_typeof(world) = 'object' and octet_length(world::text) <= 600000),
  rules       jsonb check (rules is null or jsonb_typeof(rules) = 'object'),
  territory_count integer generated always as (jsonb_array_length(coalesce(world -> 'territories', '[]'::jsonb))) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists war_maps_updated_idx on public.war_maps (updated_at desc);

create or replace function public._war_maps_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.owner_id := old.owner_id;
  return new;
end;
$$;

drop trigger if exists war_maps_touch on public.war_maps;
create trigger war_maps_touch
  before update on public.war_maps
  for each row execute function public._war_maps_touch();

alter table public.war_maps enable row level security;

drop policy if exists war_maps_read on public.war_maps;
create policy war_maps_read on public.war_maps
  for select using (true);

drop policy if exists war_maps_insert on public.war_maps;
create policy war_maps_insert on public.war_maps
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists war_maps_update on public.war_maps;
create policy war_maps_update on public.war_maps
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists war_maps_delete on public.war_maps;
create policy war_maps_delete on public.war_maps
  for delete to authenticated
  using (owner_id = auth.uid());

grant select on public.war_maps to anon, authenticated;
grant insert, update, delete on public.war_maps to authenticated;
