-- The paint board keeps each thing done to a picture -- a stroke, a fill, a
-- selection, a filter -- as its own small row, instead of rewriting the whole
-- drawing into the item after every stroke. A new stroke is one insert, and
-- what everyone else receives is that one row. Undo deletes it.
--
-- The item itself still holds what is small and shared: the layers, the size
-- of the canvas, the brushes and palettes people made.

create table if not exists public.paint_ops (
  id         uuid primary key,
  item_id    uuid not null references public.items (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  seq        bigint generated always as identity,
  op         jsonb not null check (jsonb_typeof(op) = 'object' and octet_length(op::text) <= 600000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists paint_ops_item_idx on public.paint_ops (item_id, seq);

alter table public.paint_ops enable row level security;

drop policy if exists paint_ops_read on public.paint_ops;
create policy paint_ops_read on public.paint_ops
  for select using (true);

-- Drawing on a board in a room you may write to, as yourself, and only on an
-- item that really is in that room.
drop policy if exists paint_ops_write on public.paint_ops;
create policy paint_ops_write on public.paint_ops
  for insert to authenticated
  with check (
    public.room_is_writable(room_id)
    and created_by = auth.uid()
    and exists (select 1 from public.items i where i.id = item_id and i.room_id = paint_ops.room_id)
  );

-- Undo, clearing and tidying old strokes into a picture all delete rows;
-- anyone who may draw in the room may do that, as on a shared board.
drop policy if exists paint_ops_delete on public.paint_ops;
create policy paint_ops_delete on public.paint_ops
  for delete to authenticated
  using (public.room_is_writable(room_id));

grant select on public.paint_ops to anon, authenticated;
grant insert, delete on public.paint_ops to authenticated;

alter table public.paint_ops replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.paint_ops;
  exception when duplicate_object then null;
  end;
end
$$;
