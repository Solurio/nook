-- Allow the new "cobrowse" item kind (a live shared browser powered by
-- Hyperbeam). The kind is just a label on the existing items table, so this
-- only has to widen the check constraint -- no new table or policy.

alter table public.items drop constraint if exists items_kind_check;

alter table public.items
  add constraint items_kind_check
  check (kind in ('image', 'note', 'text', 'media', 'embed', 'game', 'cobrowse'));
