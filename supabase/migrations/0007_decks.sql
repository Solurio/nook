-- Decks of cards people write for Cards Against Humanity, kept for everyone.
-- Any visitor can read every deck and pick it for a game in any room; only
-- whoever made a deck can change it or take it away. Somebody else's deck can
-- still be copied and made into your own.
--
-- The cards are plain JSON arrays of text. The counts are worked out here, so a
-- list of decks can say how big each one is without fetching every card.

create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author      text not null default '' check (char_length(author) <= 40),
  name        text not null check (char_length(name) between 1 and 60),
  language    text not null default 'en' check (language in ('en', 'pt', 'es', 'other')),
  -- For grown-ups only: shown with a warning, and never picked by default.
  adult       boolean not null default false,
  black       jsonb not null default '[]'::jsonb
              check (jsonb_typeof(black) = 'array' and jsonb_array_length(black) <= 1000),
  white       jsonb not null default '[]'::jsonb
              check (jsonb_typeof(white) = 'array' and jsonb_array_length(white) <= 2000),
  black_count integer generated always as (jsonb_array_length(black)) stored,
  white_count integer generated always as (jsonb_array_length(white)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists decks_updated_idx on public.decks (updated_at desc);

create or replace function public._decks_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  -- A deck stays with whoever made it.
  new.owner_id := old.owner_id;
  return new;
end;
$$;

drop trigger if exists decks_touch on public.decks;
create trigger decks_touch
  before update on public.decks
  for each row execute function public._decks_touch();

alter table public.decks enable row level security;

drop policy if exists decks_read on public.decks;
create policy decks_read on public.decks
  for select using (true);

drop policy if exists decks_insert on public.decks;
create policy decks_insert on public.decks
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists decks_update on public.decks;
create policy decks_update on public.decks
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists decks_delete on public.decks;
create policy decks_delete on public.decks
  for delete to authenticated
  using (owner_id = auth.uid());

grant select on public.decks to anon, authenticated;
grant insert, update, delete on public.decks to authenticated;
