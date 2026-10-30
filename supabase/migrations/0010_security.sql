-- Closing the holes.
--
-- Until now a nook was "unlisted rather than secret", but the reading rules
-- did not hold up that promise: rooms, items, messages, strokes and paint ops
-- were readable by anybody holding the project's public key -- which every
-- visitor's browser has -- so one request could list every room's link and
-- read every chat. This migration makes the link the key for real:
--
--   * opening a room by its slug (join_room) makes you a member of it;
--   * only members (and the owner) read a room and anything in it, and only
--     members may write to it.
--
-- Along with that:
--
--   * nobody but the room itself changes a room's owner or its link, and only
--     the owner locks or unlocks it (anybody could take an unlocked room over
--     by writing their own id into owner_id);
--   * secret piles: a random move out of a pile now needs the pile to be yours
--     or nobody's (anyone could pull cards out of anyone's hand and read
--     them), and pile_team / pile_show only write the kinds of pile they are
--     for, never over someone else's;
--   * uploads land only in a folder named for a room you may write to, SVG is
--     no longer accepted (a picture that can carry script), and the bucket can
--     no longer be listed;
--   * size limits on what a browser can write, so a room cannot be stuffed.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members (user_id);

alter table public.room_members enable row level security;

drop policy if exists room_members_read_own on public.room_members;
create policy room_members_read_own on public.room_members
  for select to authenticated
  using (user_id = auth.uid());

-- No insert, update or delete policies: join_room is the only way in.
grant select on public.room_members to authenticated;

-- Everyone who was already in a room when this ran keeps it: the owners, and
-- whoever has written something there.
insert into public.room_members (room_id, user_id)
select id, owner_id from public.rooms where owner_id is not null
on conflict do nothing;

insert into public.room_members (room_id, user_id)
select distinct room_id, created_by from public.items where created_by is not null
on conflict do nothing;

insert into public.room_members (room_id, user_id)
select distinct room_id, author_id from public.messages where author_id is not null
on conflict do nothing;

create or replace function public.is_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.room_members m where m.room_id = target and m.user_id = auth.uid())
    or exists (select 1 from public.rooms r where r.id = target and r.owner_id = auth.uid())
  );
$$;

-- Opening a room by its link. The slug is the key: whoever has it gets in.
create or replace function public.join_room(p_slug text)
returns setof public.rooms
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  found_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into found_room from public.rooms where slug = p_slug;
  if not found then
    return;
  end if;
  insert into public.room_members (room_id, user_id)
  values (found_room.id, auth.uid())
  on conflict do nothing;
  return next found_room;
end;
$$;

revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- Writing needs membership as well as the room being open (or yours).
create or replace function public.room_is_writable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member(target) and exists (
    select 1
      from public.rooms r
     where r.id = target
       and (not r.locked or r.owner_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Reading: members only
-- ---------------------------------------------------------------------------

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms
  for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));

drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select to authenticated
  using (public.is_member(room_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (public.is_member(room_id));

drop policy if exists strokes_read on public.strokes;
create policy strokes_read on public.strokes
  for select to authenticated
  using (public.is_member(room_id));

drop policy if exists paint_ops_read on public.paint_ops;
create policy paint_ops_read on public.paint_ops
  for select to authenticated
  using (public.is_member(room_id));

-- Without a session there is nothing to read at all.
revoke select on public.rooms, public.items, public.messages, public.strokes, public.paint_ops from anon;

-- Updating a room needs membership too.
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update to authenticated
  using (public.is_member(id) and (not locked or owner_id = auth.uid()))
  with check (public.is_member(id) and (not locked or owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- What only the owner, or nobody, may change about a room
-- ---------------------------------------------------------------------------

create or replace function public._guard_room()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.slug is distinct from old.slug or new.id is distinct from old.id then
    raise exception 'a room''s owner and link do not change' using errcode = '42501';
  end if;
  if new.locked is distinct from old.locked and old.owner_id is distinct from auth.uid() then
    raise exception 'only the owner locks or unlocks the room' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_guard on public.rooms;
create trigger rooms_guard
  before update on public.rooms
  for each row execute function public._guard_room();

-- ---------------------------------------------------------------------------
-- Size limits on what a browser writes. Not valid for rows already there --
-- they are checked from now on.
-- ---------------------------------------------------------------------------

alter table public.rooms drop constraint if exists rooms_name_length;
alter table public.rooms add constraint rooms_name_length check (char_length(name) <= 120) not valid;

alter table public.rooms drop constraint if exists rooms_slug_shape;
alter table public.rooms add constraint rooms_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$') not valid;

alter table public.rooms drop constraint if exists rooms_background_size;
alter table public.rooms add constraint rooms_background_size check (octet_length(background::text) <= 20000) not valid;

alter table public.items drop constraint if exists items_data_size;
alter table public.items add constraint items_data_size check (octet_length(data::text) <= 4000000) not valid;

alter table public.messages drop constraint if exists messages_author_size;
alter table public.messages add constraint messages_author_size check (char_length(author_name) <= 60 and char_length(author_tint) <= 32) not valid;

alter table public.strokes drop constraint if exists strokes_points_size;
alter table public.strokes add constraint strokes_points_size check (octet_length(points::text) <= 400000 and char_length(color) <= 32) not valid;

-- ---------------------------------------------------------------------------
-- Secret piles
-- ---------------------------------------------------------------------------

-- Moving cards. Same as before, except that a random draw now needs the pile
-- to be yours or nobody's -- like every other way out of a pile.
create or replace function public.pile_move(
  p_item uuid,
  p_from text,
  p_to text,
  p_cards jsonb default null,
  p_count integer default null,
  p_random boolean default false,
  p_to_owner uuid default null,
  p_bottom boolean default false,
  p_public jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  source public.secrets;
  moved jsonb;
  kept jsonb;
  outcome record;
  destination_owner uuid;
  n integer := greatest(coalesce(p_count, 1), 0);
begin
  if p_from = p_to then
    raise exception 'a pile cannot be moved onto itself' using errcode = '22023';
  end if;

  if p_cards is not null then
    source := public._pile_open(p_item, p_from, true);
    select * into outcome from public._without(source.cards, p_cards);
    if outcome.missing then
      raise exception 'those cards are not in %', p_from using errcode = '22023';
    end if;
    moved := p_cards;
    kept := outcome.remaining;
  elsif p_random then
    source := public._pile_open(p_item, p_from, false);
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into moved
      from (select value, ord from jsonb_array_elements(source.cards) with ordinality as t(value, ord)
             order by gen_random_uuid() limit n) picked;
    select * into outcome from public._without(source.cards, moved);
    kept := outcome.remaining;
  else
    source := public._pile_open(p_item, p_from, false);
    select head, tail into moved, kept from public._split(source.cards, n);
  end if;

  update public.secrets set cards = kept, updated_at = now()
   where item_id = p_item and slot = p_from;

  select owner_id into destination_owner from public.secrets
   where item_id = p_item and slot = p_to;
  if not found then
    destination_owner := p_to_owner;
  end if;

  perform public._pile_add(p_item, target, p_to, moved, destination_owner, p_bottom);
  perform public._pile_sync(p_item, p_public);

  if destination_owner = auth.uid() then
    return moved;
  end if;
  return null;
end;
$$;

-- Finding your team: only from role piles into team piles, and never over a
-- pile somebody else holds.
create or replace function public.pile_team(
  p_item uuid, p_prefix text, p_card jsonb, p_to_prefix text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  members jsonb;
  member record;
begin
  if not starts_with(p_prefix, 'role:') or not starts_with(p_to_prefix, 'team:') then
    raise exception 'teams are made from role piles into team piles' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(substr(slot, char_length(p_prefix) + 1) order by slot), '[]'::jsonb)
    into members
    from public.secrets
   where item_id = p_item and starts_with(slot, p_prefix) and cards -> 0 = p_card;

  for member in
    select slot, owner_id from public.secrets
     where item_id = p_item and starts_with(slot, p_prefix) and cards -> 0 = p_card
  loop
    insert into public.secrets (item_id, room_id, slot, owner_id, cards)
    values (p_item, target, p_to_prefix || substr(member.slot, char_length(p_prefix) + 1), member.owner_id, members)
    on conflict (item_id, slot) do update
       set cards = excluded.cards, updated_at = now()
     where public.secrets.owner_id is not distinct from excluded.owner_id;
  end loop;

  perform public._pile_sync(p_item, null);
end;
$$;

-- Showing a card privately: into a "shown:" pile for the viewer, never over
-- a pile that belongs to anyone else.
create or replace function public.pile_show(
  p_item uuid, p_from text, p_cards jsonb, p_viewer uuid, p_to text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  source public.secrets := public._pile_open(p_item, p_from, true);
  outcome record;
  existing uuid;
begin
  if not starts_with(p_to, 'shown:') then
    raise exception 'cards are shown into a shown: pile' using errcode = '22023';
  end if;
  select owner_id into existing from public.secrets where item_id = p_item and slot = p_to;
  if found and existing is distinct from p_viewer then
    raise exception 'that pile belongs to someone else' using errcode = '42501';
  end if;
  select * into outcome from public._without(source.cards, p_cards);
  if outcome.missing then
    raise exception 'those cards are not in %', p_from using errcode = '22023';
  end if;
  insert into public.secrets (item_id, room_id, slot, owner_id, cards)
  values (p_item, target, p_to, p_viewer, p_cards)
  on conflict (item_id, slot) do update
     set cards = excluded.cards, owner_id = excluded.owner_id, updated_at = now();
  perform public._pile_sync(p_item, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Uploads
-- ---------------------------------------------------------------------------

create or replace function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Files go in a folder named for a room you may write to.
drop policy if exists decorations_write on storage.objects;
create policy decorations_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'decorations'
    and public.room_is_writable(public.try_uuid((storage.foldername(name))[1]))
  );

-- The bucket is public, so a file's own link always works; what goes is the
-- ability to list everything in it.
drop policy if exists decorations_read on storage.objects;

-- No SVG: a picture that can carry script, served from the database's own
-- address. The site turns an SVG into a PNG before it uploads it.
update storage.buckets
set allowed_mime_types = array(
      select m from unnest(coalesce(allowed_mime_types, array[]::text[])) as m
       where m <> 'image/svg+xml'
    )
where id = 'decorations';
