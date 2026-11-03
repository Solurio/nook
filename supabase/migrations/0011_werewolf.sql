-- Werewolf, with the database as the narrator.
--
-- The game is all hidden information: who the wolves are, who the seer looked
-- at, whom the doctor sat up with, whom the wolves went for. In a room every
-- browser receives the item's whole state, so none of that can live there --
-- and none of it can be worked out on a player's own screen either, since
-- that screen would have to know it first.
--
-- So the night happens in here. Roles and night actions live in two tables no
-- browser can read; each player acts through a function that checks they hold
-- that chair's role card; the seer's answer and the witch's look at the
-- victim come back to the one who asked, and to nobody else. When every
-- living player has finished their night, the same function works out the
-- morning, and only what the village is allowed to know is written into the
-- item, under state.ww: who died, the dead's roles, the day's votes, who won.
--
-- Each role card is padded to the same length, so the size of a pile -- which
-- everyone can see -- says nothing about whose it is.

create table if not exists public.ww_roles (
  item_id uuid not null references public.items (id) on delete cascade,
  chair   text not null,
  role    text not null,
  primary key (item_id, chair)
);

create table if not exists public.ww_night (
  item_id uuid not null references public.items (id) on delete cascade,
  night   integer not null,
  chair   text not null,
  kind    text not null,
  target  text,
  primary key (item_id, night, chair, kind)
);

-- Potions are once a game.
create table if not exists public.ww_spent (
  item_id uuid not null references public.items (id) on delete cascade,
  chair   text not null,
  potion  text not null,
  primary key (item_id, chair, potion)
);

alter table public.ww_roles enable row level security;
alter table public.ww_night enable row level security;
alter table public.ww_spent enable row level security;
-- No policies at all: only the functions below, which run as the owner, touch these.
revoke all on public.ww_roles, public.ww_night, public.ww_spent from anon, authenticated;

-- The engine's part of the state is the engine's to write. A browser saving
-- the item (seats, the setup) gets state.ww put back the way it was.
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

  foreach key in array array['piles', 'revealed', 'peeked', 'tested', 'ww'] loop
    shape := case when key in ('piles', 'revealed', 'ww') then 'object' else 'array' end;
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

/** The caller holds this chair's role card. */
create or replace function public._ww_owns(p_item uuid, p_chair text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.secrets
     where item_id = p_item and slot = 'role:' || p_chair and owner_id = auth.uid()
  );
$$;

create or replace function public._ww_get(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(data #> '{state,ww}', '{}'::jsonb) from public.items where id = p_item;
$$;

create or replace function public._ww_put(p_item uuid, p_ww jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.items
     set data = jsonb_set(
           case when jsonb_typeof(data -> 'state') = 'object' then data else jsonb_set(data, '{state}', '{}'::jsonb) end,
           '{state,ww}', p_ww)
   where id = p_item;
$$;

create or replace function public._ww_alive(p_ww jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array(select jsonb_array_elements_text(p_ww -> 'alive')), array[]::text[]);
$$;

/** A line for the table's log, keeping the last twenty. */
create or replace function public._ww_note(p_ww jsonb, p_line text)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(p_ww, '{log}', (
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
      from (
        select value, ord
          from jsonb_array_elements(coalesce(p_ww -> 'log', '[]'::jsonb) || jsonb_build_array(p_line)) with ordinality as t(value, ord)
         order by ord desc
         limit 20
      ) last
  ));
$$;

/** Someone dies: out of the living, onto the dead with their role turned over. */
create or replace function public._ww_kill(p_item uuid, p_ww jsonb, p_chair text, p_how text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dead_role text;
begin
  if not (p_chair = any (public._ww_alive(p_ww))) then
    return p_ww;
  end if;
  select role into dead_role from public.ww_roles where item_id = p_item and chair = p_chair;
  p_ww := jsonb_set(p_ww, '{alive}', to_jsonb(array_remove(public._ww_alive(p_ww), p_chair)));
  p_ww := jsonb_set(p_ww, '{dead}', coalesce(p_ww -> 'dead', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'chair', p_chair, 'role', dead_role, 'how', p_how, 'night', coalesce((p_ww ->> 'night')::int, 0))));
  if dead_role = 'hunter' then
    p_ww := jsonb_set(p_ww, '{hunter}', to_jsonb(p_chair));
  end if;
  return p_ww;
end;
$$;

/** Whether one side has won; if so the game ends and every role is shown. */
create or replace function public._ww_judge(p_item uuid, p_ww jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wolves integer;
  others integer;
  winner text;
begin
  select count(*) filter (where role = 'wolf'), count(*) filter (where role <> 'wolf')
    into wolves, others
    from public.ww_roles
   where item_id = p_item and chair = any (public._ww_alive(p_ww));
  if wolves = 0 then
    winner := 'village';
  elsif wolves >= others then
    winner := 'wolves';
  end if;
  if winner is null then
    return p_ww;
  end if;
  return jsonb_set(jsonb_set(jsonb_set(p_ww, '{phase}', '"over"'), '{winner}', to_jsonb(winner)), '{roles}',
    (select coalesce(jsonb_object_agg(chair, role), '{}'::jsonb) from public.ww_roles where item_id = p_item));
end;
$$;

/**
 * After deaths: a dead hunter takes their shot before anything else; then the
 * game may be over; otherwise on to `next` (day or night).
 */
create or replace function public._ww_after(p_item uuid, p_ww jsonb, p_next text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  p_ww := public._ww_judge(p_item, p_ww);
  if p_ww ->> 'phase' = 'over' then
    return p_ww;
  end if;
  if jsonb_typeof(p_ww -> 'hunter') = 'string' and not coalesce((p_ww -> 'shot')::boolean, false) then
    return jsonb_set(jsonb_set(p_ww, '{phase}', '"hunter"'), '{then}', to_jsonb(p_next));
  end if;
  if p_next = 'night' then
    p_ww := jsonb_set(p_ww, '{night}', to_jsonb(coalesce((p_ww ->> 'night')::int, 0) + 1));
  end if;
  return jsonb_set(jsonb_set(jsonb_set(p_ww, '{phase}', to_jsonb(p_next)), '{done}', '[]'::jsonb), '{votes}', '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dealing
-- ---------------------------------------------------------------------------

-- Roles are made here from the setup and shuffled here, so nobody -- whoever
-- dealt included -- knows who got what. Each chair's card goes to the owner
-- given for it; a wolf's card also lists the other wolves.
create or replace function public.werewolf_deal(
  p_item uuid, p_chairs text[], p_owners uuid[], p_setup jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := public._pile_room(p_item);
  n integer := coalesce(array_length(p_chairs, 1), 0);
  wolves integer := greatest(1, least(coalesce((p_setup ->> 'wolves')::int, 1), (n - 1) / 2));
  roles text[] := array[]::text[];
  shuffled text[];
  wolf_chairs text[];
  card jsonb;
  i integer;
begin
  if n < 4 or n > 16 or coalesce(array_length(p_owners, 1), 0) <> n then
    raise exception 'a werewolf table is four to sixteen chairs, each with someone to hold its card' using errcode = '22023';
  end if;
  for i in 1 .. wolves loop roles := array_append(roles, 'wolf'); end loop;
  if coalesce((p_setup ->> 'seer')::boolean, true) then roles := array_append(roles, 'seer'); end if;
  if coalesce((p_setup ->> 'doctor')::boolean, true) then roles := array_append(roles, 'doctor'); end if;
  if coalesce((p_setup ->> 'hunter')::boolean, false) then roles := array_append(roles, 'hunter'); end if;
  if coalesce((p_setup ->> 'witch')::boolean, false) then roles := array_append(roles, 'witch'); end if;
  if array_length(roles, 1) > n then
    raise exception 'more roles than chairs' using errcode = '22023';
  end if;
  while coalesce(array_length(roles, 1), 0) < n loop roles := array_append(roles, 'villager'); end loop;
  select array_agg(r order by gen_random_uuid()) into shuffled from unnest(roles) as r;

  delete from public.secrets where item_id = p_item;
  delete from public.ww_roles where item_id = p_item;
  delete from public.ww_night where item_id = p_item;
  delete from public.ww_spent where item_id = p_item;

  for i in 1 .. n loop
    insert into public.ww_roles (item_id, chair, role) values (p_item, p_chairs[i], shuffled[i]);
  end loop;
  select array_agg(chair order by chair) into wolf_chairs from public.ww_roles where item_id = p_item and role = 'wolf';

  for i in 1 .. n loop
    -- The role, then the wolves for a wolf; nulls for everyone else, to the same length.
    if shuffled[i] = 'wolf' then
      card := jsonb_build_array(shuffled[i]) || to_jsonb(wolf_chairs);
    else
      card := jsonb_build_array(shuffled[i]) || (select coalesce(jsonb_agg(null::text), '[]'::jsonb) from generate_series(1, wolves));
    end if;
    insert into public.secrets (item_id, room_id, slot, owner_id, cards)
    values (p_item, target, 'role:' || p_chairs[i], p_owners[i], card);
  end loop;

  perform public._ww_put(p_item, jsonb_build_object(
    'game', gen_random_uuid()::text,
    'phase', 'night', 'night', 1, 'alive', to_jsonb(p_chairs), 'dead', '[]'::jsonb,
    'done', '[]'::jsonb, 'votes', '{}'::jsonb, 'hunter', null, 'shot', false,
    'morning', '[]'::jsonb, 'winner', null, 'roles', null,
    'log', jsonb_build_array('night falls on the village')));
  perform public._pile_sync(p_item, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- The night
-- ---------------------------------------------------------------------------

-- Everyone living does something each night -- villagers just sleep -- so the
-- table cannot tell who has a power from who is still busy. Kinds:
--   kill (wolf), see (seer: answers with the role), save (doctor),
--   victim (witch: answers with whom the wolves chose, once they all have),
--   heal / poison / both / pass (witch), sleep (anyone).
create or replace function public.werewolf_night(p_item uuid, p_chair text, p_kind text, p_target text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ww jsonb;
  my_role text;
  v_night integer;
  alive text[];
  wolf_target text;
  answer jsonb := null;
  finished integer;
  saved text;
  healed boolean;
  poisoned text;
  deaths text[] := array[]::text[];
  d text;
begin
  perform public._pile_room(p_item);
  if not public._ww_owns(p_item, p_chair) then
    raise exception 'that is not your card to play' using errcode = '42501';
  end if;
  ww := public._ww_get(p_item);
  if ww ->> 'phase' <> 'night' then
    raise exception 'it is not night' using errcode = '22023';
  end if;
  v_night := (ww ->> 'night')::int;
  alive := public._ww_alive(ww);
  if not (p_chair = any (alive)) then
    raise exception 'the dead sleep soundly' using errcode = '22023';
  end if;
  if p_target is not null and not (p_target = any (alive)) then
    raise exception 'that player is not alive' using errcode = '22023';
  end if;
  select role into my_role from public.ww_roles where item_id = p_item and chair = p_chair;

  -- Who the wolves went for: the most votes among the living wolves, ties broken at random.
  select target into wolf_target
    from public.ww_night n
   where n.item_id = p_item and n.night = v_night and n.kind = 'kill'
   group by target
   order by count(*) desc, gen_random_uuid()
   limit 1;

  if p_kind = 'victim' then
    if my_role <> 'witch' then
      raise exception 'only the witch asks that' using errcode = '42501';
    end if;
    -- What is left in the witch's bag comes with the answer.
    answer := jsonb_build_object(
      'heal', not exists (select 1 from public.ww_spent where item_id = p_item and chair = p_chair and potion = 'heal'),
      'poison', not exists (select 1 from public.ww_spent where item_id = p_item and chair = p_chair and potion = 'poison'));
    if exists (
      select 1 from public.ww_roles r
       where r.item_id = p_item and r.role = 'wolf' and r.chair = any (alive)
         and not exists (select 1 from public.ww_night n where n.item_id = p_item and n.night = v_night and n.chair = r.chair and n.kind = 'kill')
    ) then
      return answer || jsonb_build_object('waiting', true);
    end if;
    return answer || jsonb_build_object('victim', wolf_target);
  end if;

  if exists (select 1 from public.ww_night n where n.item_id = p_item and n.night = v_night and n.chair = p_chair and n.kind <> 'victim') then
    raise exception 'you have already had your night' using errcode = '22023';
  end if;

  if p_kind = 'kill' then
    if my_role <> 'wolf' or p_target is null then raise exception 'only a wolf hunts, and at someone' using errcode = '42501'; end if;
  elsif p_kind = 'see' then
    if my_role <> 'seer' or p_target is null then raise exception 'only the seer sees' using errcode = '42501'; end if;
    select jsonb_build_object('role', role) into answer from public.ww_roles where item_id = p_item and chair = p_target;
  elsif p_kind = 'save' then
    if my_role <> 'doctor' or p_target is null then raise exception 'only the doctor sits up with someone' using errcode = '42501'; end if;
    if exists (select 1 from public.ww_night n where n.item_id = p_item and n.night = v_night - 1 and n.chair = p_chair and n.kind = 'save' and n.target = p_target) then
      raise exception 'not the same one two nights running' using errcode = '22023';
    end if;
  elsif p_kind in ('heal', 'poison', 'both', 'pass') then
    if my_role <> 'witch' then raise exception 'only the witch has potions' using errcode = '42501'; end if;
    if p_kind in ('heal', 'both') and exists (select 1 from public.ww_spent where item_id = p_item and chair = p_chair and potion = 'heal') then
      raise exception 'the healing potion is gone' using errcode = '22023';
    end if;
    if p_kind in ('poison', 'both') then
      if p_target is null then raise exception 'poison whom?' using errcode = '22023'; end if;
      if exists (select 1 from public.ww_spent where item_id = p_item and chair = p_chair and potion = 'poison') then
        raise exception 'the poison is gone' using errcode = '22023';
      end if;
    end if;
  elsif p_kind <> 'sleep' then
    raise exception 'no such thing to do at night' using errcode = '22023';
  end if;

  insert into public.ww_night (item_id, night, chair, kind, target) values (p_item, v_night, p_chair, p_kind, p_target);
  if p_kind in ('heal', 'both') then
    insert into public.ww_spent (item_id, chair, potion) values (p_item, p_chair, 'heal');
  end if;
  if p_kind in ('poison', 'both') then
    insert into public.ww_spent (item_id, chair, potion) values (p_item, p_chair, 'poison');
  end if;

  ww := jsonb_set(ww, '{done}', coalesce(ww -> 'done', '[]'::jsonb) || to_jsonb(p_chair));

  -- Everybody has had their night: morning.
  select count(distinct chair) into finished
    from public.ww_night n
   where n.item_id = p_item and n.night = v_night and n.kind <> 'victim' and n.chair = any (alive);
  if finished >= coalesce(array_length(alive, 1), 0) then
    select target into wolf_target
      from public.ww_night n
     where n.item_id = p_item and n.night = v_night and n.kind = 'kill'
     group by target
     order by count(*) desc, gen_random_uuid()
     limit 1;
    select target into saved from public.ww_night n where n.item_id = p_item and n.night = v_night and n.kind = 'save' limit 1;
    healed := exists (select 1 from public.ww_night n where n.item_id = p_item and n.night = v_night and n.kind in ('heal', 'both'));
    select target into poisoned from public.ww_night n where n.item_id = p_item and n.night = v_night and n.kind in ('poison', 'both') limit 1;

    if wolf_target is not null and wolf_target is distinct from saved and not healed then
      deaths := array_append(deaths, wolf_target);
    end if;
    if poisoned is not null and not (poisoned = any (deaths)) then
      deaths := array_append(deaths, poisoned);
    end if;
    foreach d in array deaths loop
      ww := public._ww_kill(p_item, ww, d, case when d = poisoned and d is distinct from wolf_target then 'poison' else 'night' end);
    end loop;
    ww := jsonb_set(ww, '{morning}', to_jsonb(deaths));
    ww := public._ww_note(ww, case when array_length(deaths, 1) is null then 'morning: nobody died in the night' else 'morning: the village wakes to a death' end);
    ww := public._ww_after(p_item, ww, 'day');
  end if;

  perform public._ww_put(p_item, ww);
  return answer;
end;
$$;

-- ---------------------------------------------------------------------------
-- The day
-- ---------------------------------------------------------------------------

-- Votes are in the open. When every living player has voted, the one with
-- the most votes is put to death -- unless it is a tie, or more chose to
-- spare everyone.
create or replace function public.werewolf_vote(p_item uuid, p_chair text, p_target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ww jsonb;
  alive text[];
  top text;
  top_votes integer;
  second_votes integer;
  skips integer;
begin
  perform public._pile_room(p_item);
  if not public._ww_owns(p_item, p_chair) then
    raise exception 'that is not your vote to cast' using errcode = '42501';
  end if;
  ww := public._ww_get(p_item);
  if ww ->> 'phase' <> 'day' then
    raise exception 'votes are cast by day' using errcode = '22023';
  end if;
  alive := public._ww_alive(ww);
  if not (p_chair = any (alive)) then
    raise exception 'the dead do not vote' using errcode = '22023';
  end if;
  if p_target <> 'skip' and not (p_target = any (alive)) then
    raise exception 'that player is not alive' using errcode = '22023';
  end if;

  ww := jsonb_set(ww, array['votes', p_chair], to_jsonb(p_target));

  if (select count(*) from jsonb_object_keys(ww -> 'votes') k where k = any (alive)) >= coalesce(array_length(alive, 1), 0) then
    select count(*) into skips from jsonb_each_text(ww -> 'votes') v where v.key = any (alive) and v.value = 'skip';
    select value, count(*) into top, top_votes
      from jsonb_each_text(ww -> 'votes') v
     where v.key = any (alive) and v.value <> 'skip'
     group by value order by count(*) desc limit 1;
    select count(*) into second_votes
      from jsonb_each_text(ww -> 'votes') v
     where v.key = any (alive) and v.value <> 'skip'
     group by value order by count(*) desc offset 1 limit 1;
    if top is not null and top_votes > coalesce(second_votes, 0) and top_votes > skips then
      ww := public._ww_kill(p_item, ww, top, 'lynch');
      ww := public._ww_note(ww, 'the village has decided');
    else
      ww := public._ww_note(ww, 'the village could not agree, and nobody was put to death');
    end if;
    ww := jsonb_set(ww, '{morning}', '[]'::jsonb);
    ww := public._ww_after(p_item, ww, 'night');
  end if;

  perform public._ww_put(p_item, ww);
end;
$$;

-- The hunter, dying, takes someone with them.
create or replace function public.werewolf_shoot(p_item uuid, p_chair text, p_target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ww jsonb;
begin
  perform public._pile_room(p_item);
  if not public._ww_owns(p_item, p_chair) then
    raise exception 'that is not your gun' using errcode = '42501';
  end if;
  ww := public._ww_get(p_item);
  if ww ->> 'phase' <> 'hunter' or ww ->> 'hunter' <> p_chair then
    raise exception 'there is no shot to take' using errcode = '22023';
  end if;
  if not (p_target = any (public._ww_alive(ww))) then
    raise exception 'that player is not alive' using errcode = '22023';
  end if;
  ww := jsonb_set(ww, '{shot}', 'true'::jsonb);
  ww := public._ww_kill(p_item, ww, p_target, 'shot');
  ww := public._ww_note(ww, 'the hunter fired as they fell');
  ww := public._ww_after(p_item, ww, coalesce(ww ->> 'then', 'night'));
  perform public._ww_put(p_item, ww);
end;
$$;

revoke all on function public._ww_owns(uuid, text) from public, anon, authenticated;
revoke all on function public._ww_get(uuid) from public, anon, authenticated;
revoke all on function public._ww_put(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._ww_kill(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public._ww_judge(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._ww_after(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.werewolf_deal(uuid, text[], uuid[], jsonb) to authenticated;
grant execute on function public.werewolf_night(uuid, text, text, text) to authenticated;
grant execute on function public.werewolf_vote(uuid, text, text) to authenticated;
grant execute on function public.werewolf_shoot(uuid, text, text) to authenticated;
