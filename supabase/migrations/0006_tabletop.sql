-- Secrets, and the new objects a tabletop needs.
--
-- Every game in a nook kept its whole state in items.data, and every change to
-- an item goes out over postgres_changes to everyone in the room. That is the
-- right shape for a board everyone can see and the wrong one for anything
-- hidden: each player's hand, the order of the deck, who the spy is. Hiding
-- those in the interface only hides them from people who do not open the
-- network tab.
--
-- So hidden things live here instead, in piles:
--
--   * a pile is an ordered list of cards (any JSON), keyed by item and slot;
--   * a pile has an owner, and a pile is readable by its owner and nobody else
--     -- an ownerless pile, like a face-down deck, is readable by no one;
--   * nothing writes a pile directly. The functions below do, and each one
--     decides what the caller is allowed to do with it;
--   * every change also records each pile's owner and size in the item's own
--     state, so the table still sees how many cards everyone holds and learns
--     about changes through the item it was already listening to.
--
-- Revealing is always a public act. A card only leaves a pile for the shared
-- state through a function that puts it there for everyone at once, so there
-- is no way to look quietly -- even peeking at a face-down card leaves a note
-- on the table saying who looked.

-- ---------------------------------------------------------------------------
-- Piles
-- ---------------------------------------------------------------------------

create table if not exists public.secrets (
  item_id    uuid not null references public.items (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  slot       text not null check (char_length(slot) between 1 and 80),
  -- null means nobody may read it: a deck face down in the middle of the table
  owner_id   uuid references auth.users (id) on delete set null,
  cards      jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  -- A sealed pile is one of a set of commitments -- a vote, a secret pick --
  -- that may only be turned over once every pile in the set has something in
  -- it. Stops anyone reading the room before they have committed themselves.
  seal       text[],
  updated_at timestamptz not null default now(),
  primary key (item_id, slot)
);

create index if not exists secrets_owner_idx on public.secrets (owner_id);
create index if not exists secrets_room_idx on public.secrets (room_id);

alter table public.secrets enable row level security;

drop policy if exists secrets_read_own on public.secrets;
create policy secrets_read_own on public.secrets
  for select to authenticated
  using (owner_id = auth.uid());

-- Deliberately no insert, update or delete policies. Under row level security
-- that means no direct writes at all; the functions below are the only way in.
--
-- Also deliberately left out of the realtime publication: each function also
-- updates the item, and that update is what tells clients to look again.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The room an item lives in, if the caller may change things in it.
create or replace function public._pile_room(p_item uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select room_id into target from public.items where id = p_item;
  if target is null then
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  if not public.room_is_writable(target) then
    raise exception 'this room is locked' using errcode = '42501';
  end if;
  return target;
end;
$$;

-- A pile the caller is about to take from. Ownerless piles are fair game (a
-- deck anyone may draw from); owned ones only answer to their owner.
create or replace function public._pile_open(p_item uuid, p_slot text, p_mine_only boolean)
returns public.secrets
language plpgsql
security definer
set search_path = public
as $$
declare
  pile public.secrets;
begin
  select * into pile from public.secrets
   where item_id = p_item and slot = p_slot
   for update;
  if not found then
    raise exception 'no pile called %', p_slot using errcode = 'P0002';
  end if;
  if pile.owner_id is not null and pile.owner_id is distinct from auth.uid() then
    raise exception 'that pile is not yours' using errcode = '42501';
  end if;
  if p_mine_only and pile.owner_id is distinct from auth.uid() then
    raise exception 'that pile is not yours' using errcode = '42501';
  end if;
  return pile;
end;
$$;

-- A shuffled copy. gen_random_uuid draws on a strong random source, and the
-- order never leaves the server.
create or replace function public._shuffled(p_cards jsonb)
returns jsonb
language sql
volatile
as $$
  select coalesce(jsonb_agg(value order by gen_random_uuid()), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb));
$$;

-- The first n cards, and the rest.
create or replace function public._split(p_cards jsonb, p_n integer, out head jsonb, out tail jsonb)
language sql
immutable
as $$
  select
    coalesce((select jsonb_agg(value order by ord)
                from jsonb_array_elements(p_cards) with ordinality as t(value, ord)
               where ord <= greatest(p_n, 0)), '[]'::jsonb),
    coalesce((select jsonb_agg(value order by ord)
                from jsonb_array_elements(p_cards) with ordinality as t(value, ord)
               where ord > greatest(p_n, 0)), '[]'::jsonb);
$$;

-- Takes the named cards out of a pile, one match per card, so two identical
-- cards in a hand are two separate things to play.
create or replace function public._without(p_cards jsonb, p_take jsonb, out remaining jsonb, out missing boolean)
language plpgsql
immutable
as $$
declare
  kept jsonb[] := array(select value from jsonb_array_elements(p_cards));
  wanted jsonb;
  i integer;
  hit boolean;
begin
  missing := false;
  for wanted in select value from jsonb_array_elements(coalesce(p_take, '[]'::jsonb)) loop
    hit := false;
    for i in 1 .. coalesce(array_length(kept, 1), 0) loop
      if kept[i] = wanted then
        kept := kept[1:i - 1] || kept[i + 1:];
        hit := true;
        exit;
      end if;
    end loop;
    if not hit then
      missing := true;
    end if;
  end loop;
  remaining := coalesce(to_jsonb(kept), '[]'::jsonb);
end;
$$;

-- Adds cards to a pile, making it if need be.
create or replace function public._pile_add(
  p_item uuid, p_room uuid, p_slot text, p_cards jsonb, p_owner uuid, p_bottom boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.secrets (item_id, room_id, slot, owner_id, cards)
  values (p_item, p_room, p_slot, p_owner, coalesce(p_cards, '[]'::jsonb))
  on conflict (item_id, slot) do update
     set cards = case when p_bottom
                      then public.secrets.cards || excluded.cards
                      else excluded.cards || public.secrets.cards end,
         updated_at = now();
end;
$$;

-- Writes the public side: the state the caller sent, if any, plus who holds
-- which pile and how big it is. Never the cards.
create or replace function public._pile_sync(p_item uuid, p_public jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  base jsonb;
begin
  select coalesce(jsonb_object_agg(
           slot,
           jsonb_build_object(
             'owner', owner_id,
             'size', jsonb_array_length(cards),
             'at', (extract(epoch from updated_at) * 1000)::bigint,
             'sealed', seal is not null
           )), '{}'::jsonb)
    into meta
    from public.secrets
   where item_id = p_item;

  if p_public is not null then
    base := p_public;
  else
    select data into base from public.items where id = p_item;
  end if;

  if jsonb_typeof(base -> 'state') is distinct from 'object' then
    base := jsonb_set(coalesce(base, '{}'::jsonb), '{state}', '{}'::jsonb);
  end if;

  update public.items
     set data = jsonb_set(base, '{state,piles}', meta)
   where id = p_item;
end;
$$;

-- Puts cards on the table for everyone, under state.revealed.<slot>.
create or replace function public._publish(p_item uuid, p_slot text, p_cards jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.items
     set data = jsonb_set(
           data,
           '{state,revealed}',
           coalesce(data #> '{state,revealed}', '{}'::jsonb) || jsonb_build_object(p_slot, p_cards)
         )
   where id = p_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a client may call
-- ---------------------------------------------------------------------------

-- Clears the item's piles and lays out new ones: a fresh deck, a new round.
-- piles: [{ slot, owner?, cards, shuffle?, seal? }]
--
-- Whoever calls this supplies the cards, so they know what is in each pile --
-- which is fine for a deck everyone knows the contents of. What they do not
-- know is the order, when it is shuffled here. Hands are made with pile_deal,
-- never here, so nobody is handed knowledge of someone else's.
create or replace function public.pile_setup(p_item uuid, p_piles jsonb, p_public jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  spec jsonb;
begin
  delete from public.secrets where item_id = p_item;

  for spec in select value from jsonb_array_elements(coalesce(p_piles, '[]'::jsonb)) loop
    insert into public.secrets (item_id, room_id, slot, owner_id, cards, seal)
    values (
      p_item,
      target,
      spec ->> 'slot',
      nullif(spec ->> 'owner', '')::uuid,
      case when coalesce((spec ->> 'shuffle')::boolean, false)
           then public._shuffled(spec -> 'cards')
           else coalesce(spec -> 'cards', '[]'::jsonb) end,
      case when spec ? 'seal'
           then array(select jsonb_array_elements_text(spec -> 'seal'))
           else null end
    );
  end loop;

  -- Whatever had been turned over belonged to the last deal.
  if p_public is null then
    update public.items
       set data = (data #- '{state,revealed}') #- '{state,peeked}'
     where id = p_item;
  end if;

  perform public._pile_sync(p_item, p_public);
end;
$$;

-- Deals from one pile into several, entirely on this side. targets:
-- [{ slot, owner?, count }]. The caller never sees what anyone was given --
-- including themselves, until they read their own piles back like everyone.
create or replace function public.pile_deal(
  p_item uuid, p_from text, p_targets jsonb, p_public jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  source public.secrets := public._pile_open(p_item, p_from, false);
  spec jsonb;
  remaining jsonb := source.cards;
  cut record;
begin
  for spec in select value from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) loop
    select * into cut from public._split(remaining, coalesce((spec ->> 'count')::integer, 0));
    remaining := cut.tail;
    insert into public.secrets (item_id, room_id, slot, owner_id, cards)
    values (p_item, target, spec ->> 'slot', nullif(spec ->> 'owner', '')::uuid, cut.head)
    on conflict (item_id, slot) do update
       set cards = public.secrets.cards || excluded.cards,
           owner_id = excluded.owner_id,
           updated_at = now();
  end loop;

  update public.secrets
     set cards = remaining, updated_at = now()
   where item_id = p_item and slot = p_from;

  perform public._pile_sync(p_item, p_public);
end;
$$;

-- Moves cards from one pile to another. Three ways to say which:
--   p_cards    -- these exact cards, from a pile you own (you know what is in it)
--   p_random   -- that many at random, from anyone's pile (a steal)
--   otherwise  -- that many off the top, from a pile you own or nobody does
-- A new destination belongs to p_to_owner; leave it null for a face-down pile
-- nobody can read. Returns the cards moved only when they landed somewhere the
-- caller owns -- otherwise the caller learns nothing new.
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
    select * into source from public.secrets
     where item_id = p_item and slot = p_from
     for update;
    if not found then
      raise exception 'no pile called %', p_from using errcode = 'P0002';
    end if;
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

-- Draws off the top of a pile into one of your own. The common case of
-- pile_move, with the destination always yours.
create or replace function public.pile_draw(
  p_item uuid, p_from text, p_to text, p_count integer default 1, p_public jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
begin
  select owner_id into existing from public.secrets where item_id = p_item and slot = p_to;
  if found and existing is distinct from auth.uid() then
    raise exception 'you can only draw into your own hand' using errcode = '42501';
  end if;
  return public.pile_move(
    p_item => p_item, p_from => p_from, p_to => p_to, p_count => p_count,
    p_to_owner => auth.uid(), p_public => p_public
  );
end;
$$;

-- Plays cards out of your own pile into the open. The caller already knows
-- them, so they arrive in p_public, and both halves land in one transaction:
-- a card never leaves a hand without reaching the table.
create or replace function public.pile_take(
  p_item uuid, p_from text, p_cards jsonb, p_public jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source public.secrets;
  outcome record;
begin
  perform public._pile_room(p_item);
  source := public._pile_open(p_item, p_from, true);
  select * into outcome from public._without(source.cards, p_cards);
  if outcome.missing then
    raise exception 'those cards are not in %', p_from using errcode = '22023';
  end if;
  update public.secrets set cards = outcome.remaining, updated_at = now()
   where item_id = p_item and slot = p_from;
  perform public._pile_sync(p_item, p_public);
end;
$$;

-- Puts known cards into a pile: back into the deck, face down on the table,
-- into someone's hand. Used for cards that were already public, so nothing is
-- being given away by the caller naming them.
create or replace function public.pile_put(
  p_item uuid,
  p_to text,
  p_cards jsonb,
  p_to_owner uuid default null,
  p_shuffle boolean default false,
  p_bottom boolean default false,
  p_seal jsonb default null,
  p_public jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  existing uuid;
begin
  select owner_id into existing from public.secrets where item_id = p_item and slot = p_to;
  if not found then
    existing := p_to_owner;
  end if;
  perform public._pile_add(p_item, target, p_to, p_cards, existing, p_bottom);

  if p_seal is not null then
    update public.secrets
       set seal = array(select jsonb_array_elements_text(p_seal))
     where item_id = p_item and slot = p_to;
  end if;

  if p_shuffle then
    update public.secrets set cards = public._shuffled(cards)
     where item_id = p_item and slot = p_to;
  end if;

  perform public._pile_sync(p_item, p_public);
end;
$$;

create or replace function public.pile_shuffle(p_item uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._pile_room(p_item);
  perform public._pile_open(p_item, p_slot, false);
  update public.secrets set cards = public._shuffled(cards), updated_at = now()
   where item_id = p_item and slot = p_slot;
  perform public._pile_sync(p_item, null);
end;
$$;

-- Cuts a pile: the top p_at cards go underneath. Null cuts somewhere at
-- random, the way a hand would.
create or replace function public.pile_cut(p_item uuid, p_slot text, p_at integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pile public.secrets;
  size integer;
  at integer;
  parts record;
begin
  perform public._pile_room(p_item);
  pile := public._pile_open(p_item, p_slot, false);
  size := jsonb_array_length(pile.cards);
  if size < 2 then
    return;
  end if;
  at := coalesce(p_at, 1 + floor(random() * (size - 1))::integer);
  at := least(greatest(at, 1), size - 1);
  select * into parts from public._split(pile.cards, at);
  update public.secrets set cards = parts.tail || parts.head, updated_at = now()
   where item_id = p_item and slot = p_slot;
  perform public._pile_sync(p_item, null);
end;
$$;

-- Turns cards over for everyone: the top p_count (all of them when null), or
-- that many at random. They land in state.revealed.<slot>.
--
-- You may turn over what nobody owns, what you own, or a sealed commitment
-- once everyone in its set has committed. Never somebody else's hand.
create or replace function public.pile_reveal(
  p_item uuid,
  p_slots text[],
  p_count integer default null,
  p_random boolean default false,
  p_keep boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current text;
  pile public.secrets;
  shown jsonb;
  kept jsonb;
  outcome record;
  sibling text;
  ready boolean;
begin
  perform public._pile_room(p_item);

  -- Every permission is checked before anything moves. Turning over a set of
  -- sealed picks empties them one at a time, and checking as we went would see
  -- the first one already emptied and refuse the second.
  foreach current in array p_slots loop
    select * into pile from public.secrets
     where item_id = p_item and slot = current
     for update;
    if not found then
      raise exception 'no pile called %', current using errcode = 'P0002';
    end if;

    if pile.seal is not null then
      ready := true;
      foreach sibling in array pile.seal loop
        if not exists (
          select 1 from public.secrets
           where item_id = p_item and slot = sibling and jsonb_array_length(cards) > 0
        ) then
          ready := false;
        end if;
      end loop;
      if not ready then
        raise exception 'not everyone has committed yet' using errcode = '42501';
      end if;
    elsif pile.owner_id is not null and pile.owner_id is distinct from auth.uid() then
      raise exception 'only its owner can turn that over' using errcode = '42501';
    end if;
  end loop;

  foreach current in array p_slots loop
    select * into pile from public.secrets where item_id = p_item and slot = current;

    if p_random then
      select coalesce(jsonb_agg(value), '[]'::jsonb) into shown
        from (select value from jsonb_array_elements(pile.cards)
               order by gen_random_uuid() limit greatest(coalesce(p_count, 1), 0)) picked;
      select remaining into kept from public._without(pile.cards, shown);
    elsif p_count is null then
      shown := pile.cards;
      kept := '[]'::jsonb;
    else
      select head, tail into shown, kept from public._split(pile.cards, p_count);
    end if;

    if not p_keep then
      update public.secrets set cards = kept, updated_at = now()
       where item_id = p_item and slot = current;
    end if;

    perform public._publish(p_item, current, shown);
  end loop;

  perform public._pile_sync(p_item, null);
end;
$$;

-- Looks at one card of a pile nobody owns, without turning it over. Only the
-- caller learns what it is -- but the table learns that they looked.
create or replace function public.pile_peek(p_item uuid, p_slot text, p_index integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pile public.secrets;
  card jsonb;
begin
  perform public._pile_room(p_item);
  select * into pile from public.secrets where item_id = p_item and slot = p_slot;
  if not found then
    raise exception 'no pile called %', p_slot using errcode = 'P0002';
  end if;
  if pile.owner_id is not null then
    raise exception 'that pile belongs to someone' using errcode = '42501';
  end if;
  card := pile.cards -> greatest(p_index, 0);

  update public.items
     set data = jsonb_set(
           data,
           '{state,peeked}',
           (
             select coalesce(jsonb_agg(entry), '[]'::jsonb)
               from (
                 select entry
                   from jsonb_array_elements(
                          coalesce(data #> '{state,peeked}', '[]'::jsonb)
                          || jsonb_build_array(jsonb_build_object(
                               'slot', p_slot, 'index', p_index, 'by', auth.uid(),
                               'at', (extract(epoch from now()) * 1000)::bigint))
                        ) with ordinality as t(entry, ord)
                  order by ord desc
                  limit 20
               ) latest
           )
         )
   where id = p_item;

  return card;
end;
$$;

-- Shows cards from your own pile to one other person, privately: they get a
-- copy in a pile of their own, and the table sees that you showed them
-- something. Your cards stay where they were.
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
begin
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

-- Hands a pile you own to someone else.
create or replace function public.pile_give(p_item uuid, p_slot text, p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._pile_room(p_item);
  perform public._pile_open(p_item, p_slot, true);
  update public.secrets set owner_id = p_owner, updated_at = now()
   where item_id = p_item and slot = p_slot;
  perform public._pile_sync(p_item, null);
end;
$$;

-- Throws piles away without anyone seeing them: yours, or ones nobody owns.
create or replace function public.pile_drop(p_item uuid, p_slots text[], p_public jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current text;
begin
  perform public._pile_room(p_item);
  foreach current in array p_slots loop
    if exists (select 1 from public.secrets where item_id = p_item and slot = current) then
      perform public._pile_open(p_item, current, false);
      delete from public.secrets where item_id = p_item and slot = current;
    end if;
  end loop;
  perform public._pile_sync(p_item, p_public);
end;
$$;

-- The helpers are for the functions above, not for calling from a browser.
-- Supabase grants execute on new functions to its API roles by default, so
-- revoking from public alone would leave them callable.
revoke all on function public._pile_room(uuid) from public, anon, authenticated;
revoke all on function public._pile_open(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public._pile_add(uuid, uuid, text, jsonb, uuid, boolean) from public, anon, authenticated;
revoke all on function public._pile_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._publish(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- New kinds of object on the canvas
-- ---------------------------------------------------------------------------

alter table public.items drop constraint if exists items_kind_check;

alter table public.items
  add constraint items_kind_check
  check (kind in (
    'image', 'note', 'text', 'media', 'embed', 'game', 'cobrowse', 'screencast',
    -- a document laid on the table, as a book or on a clipboard
    'pdf',
    -- a piece, token or marker for a tabletop
    'token',
    -- a square or hex grid to play on
    'grid'
  ));

-- ---------------------------------------------------------------------------
-- Uploads: PDFs
-- ---------------------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array(
      select distinct unnest(coalesce(allowed_mime_types, array[]::text[]) || array['application/pdf'])
    )
where id = 'decorations';
