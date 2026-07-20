-- Free-hand ink drawn straight onto the room (as opposed to inside a doodle
-- board item). Each finished stroke is a row, so it persists and fans out over
-- postgres_changes exactly like items do. In-progress strokes travel over
-- broadcast and never touch this table.

create table if not exists public.strokes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  color      text not null,
  size       double precision not null default 4,
  -- flat [x0,y0,x1,y1,...] in world coordinates, so ink sits on the canvas
  -- rather than the screen and survives pan and zoom.
  points     jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists strokes_room_idx on public.strokes (room_id);

alter table public.strokes enable row level security;

drop policy if exists strokes_read on public.strokes;
create policy strokes_read on public.strokes
  for select using (true);

drop policy if exists strokes_write on public.strokes;
create policy strokes_write on public.strokes
  for insert to authenticated
  with check (public.room_is_writable(room_id));

-- Erasing is deleting the row, so anyone who may draw in the room may also rub
-- something out -- the point of a shared board.
drop policy if exists strokes_delete on public.strokes;
create policy strokes_delete on public.strokes
  for delete to authenticated
  using (public.room_is_writable(room_id));

alter table public.strokes replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.strokes;
  exception when duplicate_object then null;
  end;
end
$$;
