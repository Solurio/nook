# Security

## How nook is protected

nook is a static site. The browser talks straight to Supabase with the public
(anon) key, which every visitor's browser has; what keeps data safe is the
database's row level security, plus two small Cloudflare functions for the
things that need a secret.

**Rooms.** A room's link is its key. Opening a room by its link (the
`join_room` function) makes you a member, and only members -- and the owner --
can read a room, its items, its chat, its drawings, or write to them. Nobody
can list rooms. A room's owner and link never change; only the owner locks or
deletes it. Locking leaves the room readable by its members but writable only
by the owner.

**Hidden cards.** Hands, decks and votes live in `secrets`, which no browser
reads or writes directly. Each pile is readable only by its owner; the pile
functions decide every move, and anything turned over is turned over for the
whole table at once. Nobody can draw out of somebody else's hand.

**Uploads.** Files go into a folder named for a room the uploader may write to,
in a public bucket that cannot be listed. SVG is not accepted (it can carry
script); the site converts SVGs to PNG before uploading.

**The browser.** Every page is served with a content security policy that
allows only the site's own scripts (the inline ones by hash, worked out at
build time), YouTube's and SoundCloud's player scripts, and nothing else;
no plugins, no framing by other sites, no camera, microphone or location.
Links and addresses that come from shared room state are only used if they
are web addresses.

**Server side.** `/api/cobrowse` starts paid Hyperbeam machines, so it requires
a signed-in visitor who is in the room they ask for, and allows one machine
per person every 30 seconds. `/api/klipy` only answers the site itself. Both
keep their keys in Cloudflare's environment, never in the repository.

## Running it safely

- Run every migration in `supabase/migrations`, in order. `0010_security.sql`
  is the one that closes reading and writing to members; the site works before
  it, but the protections above only hold after it.
- Keep **Anonymous sign-ins** on in Supabase (Authentication -> Providers) --
  visitors need a session -- and keep **rate limits** on (Authentication ->
  Rate Limits) so nobody makes sessions by the thousand.
- The **service role key** never goes in the site or the repository. Only
  `scripts/upload-folder.mjs` uses it, read from `.env.local` for that run.
- Cloudflare Pages needs `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the shared browser checks visitors with
  them) and, for the shared browser, `HYPERBEAM_API_KEY`.

## Reporting a problem

Please do not open a public issue for a security problem. Write to the
repository owner through GitHub instead, with what you found and how to see it.
