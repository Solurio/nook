-- Nook: schema, policies and realtime wiring.
-- Run this once against a fresh Supabase project (SQL Editor or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null default 'untitled nook',
  owner_id    uuid references auth.users (id) on delete set null,
  background  jsonb not null default '{"kind":"gradient","from":"#1b1725","to":"#2c2136","angle":150}'::jsonb,
  -- when true only the owner may mutate the room and its items
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists rooms_owner_idx on public.rooms (owner_id);

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  kind        text not null check (kind in ('image','note','text','media','embed','game')),
  x           double precision not null default 0,
  y           double precision not null default 0,
  width       double precision not null default 280,
  height      double precision not null default 200,
  rotation    double precision not null default 0,
  z           integer not null default 0,
  -- kind-specific payload; see src/lib/items.ts for the shape of each variant
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_room_idx on public.items (room_id);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_name text not null default 'someone',
  author_tint text not null default '#c4b5fd',
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists messages_room_created_idx
  on public.messages (room_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- Deliberately no trigger bumping rooms.updated_at when items change: every
-- drag would emit a rooms UPDATE to every connected client, and nothing in the
-- app reads that timestamp.

-- ---------------------------------------------------------------------------
-- Row level security
--
-- A nook is unlisted rather than secret: the slug is the capability. Anyone
-- holding the link can read it, and any signed-in visitor (anonymous sessions
-- included) can rearrange it. Locking a room narrows writes to the owner.
-- ---------------------------------------------------------------------------

alter table public.rooms    enable row level security;
alter table public.items    enable row level security;
alter table public.messages enable row level security;

create or replace function public.room_is_writable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.rooms r
     where r.id = target
       and (not r.locked or r.owner_id = auth.uid())
  );
$$;

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms
  for select using (true);

drop policy if exists rooms_create on public.rooms;
create policy rooms_create on public.rooms
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update to authenticated
  using (not locked or owner_id = auth.uid())
  with check (not locked or owner_id = auth.uid());

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select using (true);

drop policy if exists items_write on public.items;
create policy items_write on public.items
  for insert to authenticated
  with check (public.room_is_writable(room_id));

drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (public.room_is_writable(room_id))
  with check (public.room_is_writable(room_id));

drop policy if exists items_delete on public.items;
create policy items_delete on public.items
  for delete to authenticated
  using (public.room_is_writable(room_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select using (true);

drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.room_is_writable(room_id));

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Durable state fans out over postgres_changes; cursors and in-flight drags go
-- over broadcast instead, so they never touch the database.
-- ---------------------------------------------------------------------------

alter table public.rooms    replica identity full;
alter table public.items    replica identity full;
alter table public.messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Storage for uploaded decorations
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'decorations',
  'decorations',
  true,
  10485760,
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml','audio/mpeg','audio/ogg','audio/wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists decorations_read on storage.objects;
create policy decorations_read on storage.objects
  for select using (bucket_id = 'decorations');

drop policy if exists decorations_write on storage.objects;
create policy decorations_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'decorations');

drop policy if exists decorations_replace on storage.objects;
create policy decorations_replace on storage.objects
  for update to authenticated
  using (bucket_id = 'decorations' and owner = auth.uid());

drop policy if exists decorations_remove on storage.objects;
create policy decorations_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'decorations' and owner = auth.uid());
