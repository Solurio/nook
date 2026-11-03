-- Detective: a murder, a sealed envelope, and a house full of suspects.
--
-- Three cards go into the envelope -- who, with what, where -- and the rest
-- are dealt out. Nobody may read the envelope, so it is a pile with no owner.
-- What makes this game hard to run in a browser is the answering: when you
-- suggest a solution, the first player round the table who holds one of the
-- three cards must show you one, and only you. If players answered for
-- themselves, a player could quietly claim to hold none of them. So the
-- database answers: it checks each hand in turn, writes down publicly who
-- could not answer and who did, and puts the card shown into a pile only the
-- one who asked can read. When the player answering holds more than one of
-- the three, the choice of which to show is theirs, and the table waits.
--
-- The house is nine rooms in a three by three grid; you move one room a turn,
-- and the corner rooms are joined diagonally by secret passages. You may only
-- suggest in the room you stand in. An accusation is checked against the
-- envelope: right, and you win; wrong, and you are out, though you still hold
-- your cards and still answer.
--
-- Everything the table may know lives under state.cs, written only here.

create or replace function public._keep_table_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  key text;
  shape text;
  was jsonb;
  sent jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if jsonb_typeof(new.data -> 'state') is distinct from 'object' then
    return new;
  end if;

  foreach key in array array['piles', 'revealed', 'peeked', 'tested', 'ww', 'cs'] loop
    shape := case when key in ('piles', 'revealed', 'ww', 'cs') then 'object' else 'array' end;
    was := old.data #> array['state', key];
    sent := new.data #> array['state', key];
    if jsonb_typeof(was) = shape then
      new.data := jsonb_set(new.data, array['state', key], was);
    elsif jsonb_typeof(sent) = shape then
      new.data := new.data #- array['state', key];
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** The caller holds this chair's hand. */
create or replace function public._dt_owns(p_item uuid, p_chair text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.secrets
     where item_id = p_item and slot = 'hand:' || p_chair and owner_id = auth.uid()
  );
$$;

create or replace function public._dt_get(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(data #> '{state,cs}', '{}'::jsonb) from public.items where id = p_item;
$$;

create or replace function public._dt_put(p_item uuid, p_cs jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.items
     set data = jsonb_set(
           case when jsonb_typeof(data -> 'state') = 'object' then data else jsonb_set(data, '{state}', '{}'::jsonb) end,
           '{state,cs}', p_cs)
   where id = p_item;
$$;

create or replace function public._dt_list(p_cs jsonb, p_key text)
returns text[]
language sql
immutable
as $$
  select coalesce(array(select jsonb_array_elements_text(p_cs -> p_key)), array[]::text[]);
$$;

/** Whose turn comes after this chair: the next one round that is not out. */
create or replace function public._dt_next(p_cs jsonb, p_chair text)
returns text
language plpgsql
immutable
as $$
declare
  chairs text[] := public._dt_list(p_cs, 'chairs');
  out_ text[] := public._dt_list(p_cs, 'out');
  n integer := coalesce(array_length(chairs, 1), 0);
  pos integer := coalesce(array_position(chairs, p_chair), 0);
  k integer;
  c text;
begin
  for k in 1 .. n loop
    c := chairs[((pos - 1 + k) % n) + 1];
    if not (c = any (out_)) then
      return c;
    end if;
  end loop;
  return p_chair;
end;
$$;

/** Rooms in a three by three grid: next door up, down, left or right, or across a corner passage. */
create or replace function public._dt_adjacent(p_from integer, p_to integer)
returns boolean
language sql
immutable
as $$
  select (p_from between 0 and 8) and (p_to between 0 and 8) and (
    (abs(p_from / 3 - p_to / 3) + abs(p_from % 3 - p_to % 3) = 1)
    or (least(p_from, p_to) = 0 and greatest(p_from, p_to) = 8)
    or (least(p_from, p_to) = 2 and greatest(p_from, p_to) = 6)
  );
$$;

/** It is this chair's turn and the caller holds its hand; returns the state. */
create or replace function public._dt_turn(p_item uuid, p_chair text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb;
begin
  perform public._pile_room(p_item);
  if not public._dt_owns(p_item, p_chair) then
    raise exception 'that is not your hand' using errcode = '42501';
  end if;
  cs := public._dt_get(p_item);
  if cs ->> 'phase' is distinct from 'play' then
    raise exception 'there is no case open' using errcode = '22023';
  end if;
  if cs ->> 'turn' is distinct from p_chair then
    raise exception 'it is not your turn' using errcode = '22023';
  end if;
  if jsonb_typeof(cs -> 'pending') = 'object' then
    raise exception 'someone still has to answer' using errcode = '22023';
  end if;
  return cs;
end;
$$;

/** A card shown privately: into the asker's pile of what they have been shown. */
create or replace function public._dt_show(p_item uuid, p_from text, p_by text, p_card text, p_turn integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.secrets
     set cards = cards || jsonb_build_array(jsonb_build_object('card', p_card, 'by', p_by, 'turn', p_turn)),
         updated_at = now()
   where item_id = p_item and slot = 'seen:' || p_from;
$$;

/** The table's record of a suggestion, kept to the last forty. */
create or replace function public._dt_record(p_cs jsonb, p_entry jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(p_cs, '{history}', (
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
      from (
        select value, ord
          from jsonb_array_elements(coalesce(p_cs -> 'history', '[]'::jsonb) || jsonb_build_array(p_entry)) with ordinality as t(value, ord)
         order by ord desc
         limit 40
      ) last
  ));
$$;

-- ---------------------------------------------------------------------------
-- Dealing
-- ---------------------------------------------------------------------------

-- The deck is the table's: suspects, weapons, and exactly nine rooms, laid out
-- three by three in the order given. One of each goes into the envelope, at
-- random, here, and the rest are shuffled and dealt round from a random chair.
create or replace function public.detective_deal(
  p_item uuid, p_chairs text[], p_owners uuid[], p_deck jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  n integer := coalesce(array_length(p_chairs, 1), 0);
  suspects text[] := coalesce(array(select jsonb_array_elements_text(p_deck -> 'suspects')), array[]::text[]);
  weapons text[] := coalesce(array(select jsonb_array_elements_text(p_deck -> 'weapons')), array[]::text[]);
  rooms text[] := coalesce(array(select jsonb_array_elements_text(p_deck -> 'rooms')), array[]::text[]);
  everything text[];
  envelope text[];
  rest text[];
  first integer;
  i integer;
  spots jsonb := '{}'::jsonb;
begin
  if n < 2 or n > 6 or coalesce(array_length(p_owners, 1), 0) <> n then
    raise exception 'a detective table is two to six chairs, each with someone to hold its hand' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(p_chairs) c) <> n then
    raise exception 'every chair once' using errcode = '22023';
  end if;
  if coalesce(array_length(suspects, 1), 0) not between 3 and 9
     or coalesce(array_length(weapons, 1), 0) not between 3 and 9
     or coalesce(array_length(rooms, 1), 0) <> 9 then
    raise exception 'three to nine suspects, three to nine weapons, and nine rooms' using errcode = '22023';
  end if;
  everything := array(select 's:' || x from unnest(suspects) x)
             || array(select 'w:' || x from unnest(weapons) x)
             || array(select 'r:' || x from unnest(rooms) x);
  if exists (select 1 from unnest(everything) c where c !~ '^[swr]:[a-z0-9_-]{1,24}$')
     or (select count(distinct c) from unnest(everything) c) <> array_length(everything, 1) then
    raise exception 'cards are short plain names, each once' using errcode = '22023';
  end if;

  envelope := array[
    's:' || suspects[1 + floor(random() * array_length(suspects, 1))::int],
    'w:' || weapons[1 + floor(random() * array_length(weapons, 1))::int],
    'r:' || rooms[1 + floor(random() * 9)::int]
  ];
  select array_agg(c order by gen_random_uuid()) into rest
    from unnest(everything) c
   where not (c = any (envelope));

  delete from public.secrets where item_id = p_item;
  insert into public.secrets (item_id, room_id, slot, owner_id, cards)
  values (p_item, target, 'envelope', null, to_jsonb(envelope));

  first := floor(random() * n)::int;
  for i in 1 .. n loop
    insert into public.secrets (item_id, room_id, slot, owner_id, cards)
    values (
      p_item, target, 'hand:' || p_chairs[i], p_owners[i],
      coalesce((
        select jsonb_agg(c order by k)
          from unnest(rest) with ordinality as d(c, k)
         where (k - 1) % n = ((i - 1 - first) % n + n) % n
      ), '[]'::jsonb)
    );
    insert into public.secrets (item_id, room_id, slot, owner_id, cards)
    values (p_item, target, 'seen:' || p_chairs[i], p_owners[i], '[]'::jsonb);
    -- Everyone starts in the middle of the house.
    spots := spots || jsonb_build_object(p_chairs[i], 4);
  end loop;

  perform public._dt_put(p_item, jsonb_build_object(
    'game', gen_random_uuid()::text,
    'phase', 'play',
    'chairs', to_jsonb(p_chairs),
    'suspects', to_jsonb(suspects),
    'weapons', to_jsonb(weapons),
    'rooms', to_jsonb(rooms),
    'turn', p_chairs[first + 1],
    'turns', 1,
    'at', spots,
    'moved', false,
    'suggested', false,
    'out', '[]'::jsonb,
    'pending', null,
    'history', '[]'::jsonb,
    'accused', '[]'::jsonb,
    'winner', null,
    'answer', null));
  perform public._pile_sync(p_item, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- A turn
-- ---------------------------------------------------------------------------

create or replace function public.detective_move(p_item uuid, p_chair text, p_room integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb := public._dt_turn(p_item, p_chair);
  here integer := (cs #>> array['at', p_chair])::int;
begin
  if coalesce((cs ->> 'moved')::boolean, false) or coalesce((cs ->> 'suggested')::boolean, false) then
    raise exception 'you have already moved this turn' using errcode = '22023';
  end if;
  if not public._dt_adjacent(here, p_room) then
    raise exception 'that room is not next to yours' using errcode = '22023';
  end if;
  cs := jsonb_set(cs, array['at', p_chair], to_jsonb(p_room));
  cs := jsonb_set(cs, '{moved}', 'true'::jsonb);
  perform public._dt_put(p_item, cs);
end;
$$;

-- A suggestion: this suspect, with this weapon, in the room you are standing
-- in. The database goes round the table and answers it. Comes back with the
-- card shown, when only one could be, or with who is choosing.
create or replace function public.detective_suggest(p_item uuid, p_chair text, p_suspect text, p_weapon text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb := public._dt_turn(p_item, p_chair);
  chairs text[] := public._dt_list(cs, 'chairs');
  n integer := coalesce(array_length(chairs, 1), 0);
  me_at integer := coalesce(array_position(chairs, p_chair), 1);
  room text;
  asked text[];
  passed text[] := array[]::text[];
  hand jsonb;
  matches text[];
  c text;
  k integer;
  entry jsonb;
begin
  if not coalesce((cs ->> 'moved')::boolean, false) then
    raise exception 'move to a room first' using errcode = '22023';
  end if;
  if coalesce((cs ->> 'suggested')::boolean, false) then
    raise exception 'one suggestion a turn' using errcode = '22023';
  end if;
  if not (p_suspect = any (public._dt_list(cs, 'suspects'))) or not (p_weapon = any (public._dt_list(cs, 'weapons'))) then
    raise exception 'no such suspect or weapon' using errcode = '22023';
  end if;
  room := cs -> 'rooms' ->> ((cs #>> array['at', p_chair])::int);
  asked := array['s:' || p_suspect, 'w:' || p_weapon, 'r:' || room];
  cs := jsonb_set(cs, '{suggested}', 'true'::jsonb);

  for k in 1 .. n - 1 loop
    c := chairs[((me_at - 1 + k) % n) + 1];
    select cards into hand from public.secrets where item_id = p_item and slot = 'hand:' || c;
    matches := array(select x from jsonb_array_elements_text(coalesce(hand, '[]'::jsonb)) x where x = any (asked));
    if coalesce(array_length(matches, 1), 0) = 0 then
      passed := array_append(passed, c);
      continue;
    end if;
    entry := jsonb_build_object('from', p_chair, 'cards', to_jsonb(asked), 'passed', to_jsonb(passed), 'by', c, 'turn', (cs ->> 'turns')::int);
    if array_length(matches, 1) = 1 then
      perform public._dt_show(p_item, p_chair, c, matches[1], (cs ->> 'turns')::int);
      cs := public._dt_record(cs, entry);
      perform public._dt_put(p_item, cs);
      perform public._pile_sync(p_item, null);
      return jsonb_build_object('by', c, 'card', matches[1]);
    end if;
    cs := jsonb_set(cs, '{pending}', entry);
    perform public._dt_put(p_item, cs);
    return jsonb_build_object('by', c, 'waiting', true);
  end loop;

  cs := public._dt_record(cs, jsonb_build_object('from', p_chair, 'cards', to_jsonb(asked), 'passed', to_jsonb(passed), 'by', null, 'turn', (cs ->> 'turns')::int));
  perform public._dt_put(p_item, cs);
  return jsonb_build_object('by', null);
end;
$$;

-- The player answering, holding more than one of the three, picks which to show.
create or replace function public.detective_show(p_item uuid, p_chair text, p_card text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb;
  pending jsonb;
begin
  perform public._pile_room(p_item);
  if not public._dt_owns(p_item, p_chair) then
    raise exception 'that is not your hand' using errcode = '42501';
  end if;
  cs := public._dt_get(p_item);
  pending := cs -> 'pending';
  if jsonb_typeof(pending) is distinct from 'object' or pending ->> 'by' is distinct from p_chair then
    raise exception 'nobody is waiting on you' using errcode = '22023';
  end if;
  if not (pending -> 'cards' ? p_card) then
    raise exception 'that card was not asked about' using errcode = '22023';
  end if;
  if not exists (select 1 from public.secrets where item_id = p_item and slot = 'hand:' || p_chair and cards ? p_card) then
    raise exception 'you do not hold that card' using errcode = '22023';
  end if;
  perform public._dt_show(p_item, pending ->> 'from', p_chair, p_card, (pending ->> 'turn')::int);
  cs := public._dt_record(cs, pending);
  cs := jsonb_set(cs, '{pending}', 'null'::jsonb);
  perform public._dt_put(p_item, cs);
  perform public._pile_sync(p_item, null);
end;
$$;

create or replace function public.detective_end(p_item uuid, p_chair text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb := public._dt_turn(p_item, p_chair);
begin
  cs := jsonb_set(cs, '{turn}', to_jsonb(public._dt_next(cs, p_chair)));
  cs := jsonb_set(cs, '{turns}', to_jsonb(coalesce((cs ->> 'turns')::int, 0) + 1));
  cs := jsonb_set(jsonb_set(cs, '{moved}', 'false'::jsonb), '{suggested}', 'false'::jsonb);
  perform public._dt_put(p_item, cs);
end;
$$;

-- An accusation, checked against the envelope. Right: the case is closed and
-- the envelope opened for everyone. Wrong: you are out, and you alone are
-- shown what was in it. If only one player is left in, they have it.
create or replace function public.detective_accuse(p_item uuid, p_chair text, p_suspect text, p_weapon text, p_room text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cs jsonb := public._dt_turn(p_item, p_chair);
  envelope jsonb;
  claim jsonb := jsonb_build_array('s:' || p_suspect, 'w:' || p_weapon, 'r:' || p_room);
  right_ boolean;
  left_ text[];
begin
  select s.cards into envelope from public.secrets s where s.item_id = p_item and s.slot = 'envelope';
  right_ := envelope @> claim and claim @> envelope;
  cs := jsonb_set(cs, '{accused}', coalesce(cs -> 'accused', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('chair', p_chair, 'cards', claim, 'right', right_)));

  if right_ then
    cs := jsonb_set(jsonb_set(jsonb_set(cs, '{phase}', '"over"'), '{winner}', to_jsonb(p_chair)), '{answer}', envelope);
  else
    cs := jsonb_set(cs, '{out}', coalesce(cs -> 'out', '[]'::jsonb) || to_jsonb(p_chair));
    left_ := array(select c from unnest(public._dt_list(cs, 'chairs')) c where not (c = any (public._dt_list(cs, 'out'))));
    if coalesce(array_length(left_, 1), 0) <= 1 then
      cs := jsonb_set(jsonb_set(jsonb_set(cs, '{phase}', '"over"'), '{winner}', coalesce(to_jsonb(left_[1]), 'null'::jsonb)), '{answer}', envelope);
    else
      cs := jsonb_set(cs, '{turn}', to_jsonb(public._dt_next(cs, p_chair)));
      cs := jsonb_set(cs, '{turns}', to_jsonb(coalesce((cs ->> 'turns')::int, 0) + 1));
      cs := jsonb_set(jsonb_set(cs, '{moved}', 'false'::jsonb), '{suggested}', 'false'::jsonb);
    end if;
  end if;
  perform public._dt_put(p_item, cs);
  return jsonb_build_object('right', right_, 'answer', envelope);
end;
$$;

revoke all on function public._dt_owns(uuid, text) from public, anon, authenticated;
revoke all on function public._dt_get(uuid) from public, anon, authenticated;
revoke all on function public._dt_put(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._dt_turn(uuid, text) from public, anon, authenticated;
revoke all on function public._dt_show(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.detective_deal(uuid, text[], uuid[], jsonb) to authenticated;
grant execute on function public.detective_move(uuid, text, integer) to authenticated;
grant execute on function public.detective_suggest(uuid, text, text, text) to authenticated;
grant execute on function public.detective_show(uuid, text, text) to authenticated;
grant execute on function public.detective_end(uuid, text) to authenticated;
grant execute on function public.detective_accuse(uuid, text, text, text, text) to authenticated;
