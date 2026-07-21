-- Allow the new "screencast" item kind (a live tab/screen share over WebRTC).
-- Like the other kinds this is just a label on the items table; the video is
-- peer-to-peer and never stored.

alter table public.items drop constraint if exists items_kind_check;

alter table public.items
  add constraint items_kind_check
  check (kind in ('image', 'note', 'text', 'media', 'embed', 'game', 'cobrowse', 'screencast'));
