# nook

A small room on the internet. You open it, throw some photos on the wall, stick
notes up, put music on, and send the link to someone. Whoever walks in sees it
exactly how you left it, and watches it happen live.

Built out of missing Here.fm.

## What you can do in there

A room is an infinite canvas. You drag, rotate and resize anything you put on
it, and it all stays where you dropped it.

- **Photos and GIFs.** Drag from your desktop, paste from the clipboard
  (Ctrl+V), or drop in a URL. GIFs animate. Four frames to choose from: plain,
  shadowed, polaroid, sticker.
- **Notes** and **big text.** Double click to write. What you type shows up for
  everyone else as you type it, and text can be set to shimmer through a
  rainbow, shake, ripple a letter at a time, glow or pulse.
- **Drawing on the room.** A brush that paints straight onto the infinite
  canvas, with a colour palette, a custom colour and adjustable width. There's
  an eraser too (drag over a stroke to remove it). Every stroke is shared live
  and saved.
- **Music and video in sync.** Paste a **YouTube** link, a direct audio file
  (**.mp3/.ogg/.wav/.m4a/...**) or a **SoundCloud** track, and everyone listens
  together. Play, pause or scrub and it moves for the whole room. Browsers
  won't autoplay audio without a click, so anyone arriving starts **muted** but
  already in sync, then clicks to turn sound on. There's a queue and an
  audio-only mode. A YouTube **playlist** link loads the whole list, and an mp3
  or mp4 dropped in (or picked from your phone) is uploaded and played the same
  way. Each provider is driven through its own control API, which is why the
  sync is real rather than approximate.
- **Stickers and GIFs.** A search panel that drops the GIF onto the wall as an
  object, the way Here.fm did it. Needs a free key (see below); without one the
  rest of the app works fine.
- **Windows.** A page the whole room shares. The address belongs to the window
  rather than to one person's browser, so typing a new one moves it for
  everybody at once. Twitch, Vimeo, SoundCloud and Spotify links convert to the
  right player automatically.
- **Games.** Chess (with check, mate and castling), checkers, connect four,
  tic-tac-toe, **intransitive** (a race where the pieces beat each other in a
  circle instead of a ladder), **dominoes**, **codenames** in English or
  Portuguese, **coup**, and a **card table** you set up yourself: pick which
  ranks and suits are in the deck, how many chairs, whether they play in pairs,
  then shuffle and deal.

  Every game has chairs. Sit in one and the turns are yours; leave them all
  empty and whoever is holding the device plays every side, which is how one
  phone gets passed round a room. The board turns to face whichever chair you
  took.
- **Paint board.** Not a doodle pad: a raster painting app with everyone drawing
  at once. Brushes (pen, marker, spray, eraser), a **paint bucket**, size and
  opacity, **graphics tablet pressure** with adjustable sensitivity and palm
  rejection, a full colour picker, **layers** (add, hide, opacity, hue), and
  export as a PNG or as a **looping gif of the drawing being made**.
- **Decorating.** A solid colour, a gradient, or your own image, either
  stretched or tiled, with a dimmer.
- **Chat**, named cursors for everyone online, and reactions that float up the
  screen.

When someone opens the link they pick a nickname and a colour first, then walk
in. The nickname is remembered for next time.

Shortcuts: `V` back to the cursor, `B` brush, `E` eraser, space to drag the
canvas, Ctrl+scroll to zoom, Delete to remove the selection, Ctrl+D to
duplicate, Ctrl+0 to recentre, Esc to drop everything.

## How it works

The only real service behind this is Supabase, and it plays three parts at
once: the database (Postgres), realtime, and storage for the images you upload.
That's deliberate. It buys persistence and realtime without keeping a server
running anywhere, and it fits comfortably inside the free tier for a handful of
people.

Realtime is split into two lanes, because the two kinds of traffic want
opposite things:

- **Things that have to survive** (an item created, moved to its final spot, a
  message, the state of a game) go to Postgres. Supabase re-emits those changes
  over `postgres_changes` to everyone in the room. It's slower, but anyone
  arriving later sees exactly what the others see. No state lives only in
  somebody's memory.
- **Disposable things** (cursor position, an item mid-drag, a brush stroke still
  being drawn) go over `broadcast`, which never touches the database. That's
  dozens of messages a second worth nothing five seconds later, and writing them
  down would only burn quota.

In practice: you drag a photo, and while you're dragging everyone sees it glide
via broadcast. When you let go, one Postgres row is updated and that's the
version that sticks. Someone joining mid-drag gets the final position.

Synced video doesn't ping "I'm at second 43" on a timer. What gets saved is a
pair: the playhead position and the instant it was measured. Each client
extrapolates from there on its own and, every second and a half, compares
against its own player. If the gap passes 1.4s it corrects. That holds sync
through people coming and going, and survives a tab sitting in the background.

### Stack

Next.js 16 (App Router) with React 19, TypeScript, Tailwind v4, and Zustand for
room state. Supabase for the rest. It's exported as a static site
(`output: "export"`), so the whole app runs in the browser and hosts anywhere.
The room to open arrives in the `?r=` query parameter (`/r/?r=cocoa-willow-7fk2`),
so there's no dynamic route for a static host to trip over.

### Permissions

A room is *unlisted*, not secret: the link is the key. Anyone with it walks in
and can edit. If you want to freeze it, the owner gets a padlock at the top.
With it closed only the owner edits and everyone else is read-only. That's
enforced by RLS in Postgres, not just by hiding a button.

Nobody makes an account. On the first visit Supabase issues an anonymous
session, and the nickname and colour live in localStorage.

## Running it

You need Node 20+ and a Supabase project (the free plan is enough).

**1. Create the Supabase project.** At [supabase.com](https://supabase.com),
create a new project. Pick the region closest to you, it feeds straight into
realtime latency.

**2. Run the migrations.** Open the project's SQL Editor and run the contents of
`supabase/migrations/` in order. All of them, including the newest: `0005`
widens what the upload bucket accepts, and without it a photo straight off a
phone is refused for being HEIC. The first creates the tables, the RLS policies,
turns on realtime replication and creates the image bucket. The rest add the
`strokes` table (without it the brush doesn't save) and widen the allowed item
kinds. Run them in numeric order, and if you ever re-run an older one, run the
newest one last, since they redefine the same constraint.

**3. Turn on anonymous sign-in.** Under *Authentication → Sign In / Providers*,
enable **Anonymous sign-ins**. Without it nobody can get in, because every write
depends on having a session.

**4. Set the keys.**

```bash
cp .env.example .env.local
```

Fill in the project URL and the anon/publishable key (both under
*Project Settings → API*). These are public keys and are meant to reach the
browser. RLS is what protects the data.

**5. Start it.**

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`.

### Publishing

The site exports statically (`npm run build` produces `out/`), so it goes up on
any free static host. Step by step for Cloudflare Pages and Vercel is in
[DEPLOY.md](DEPLOY.md). There's no socket server, no cron, no worker. Supabase
handles all of it from the browser.

The Supabase free plan gives 500MB of database, 1GB of storage, 200 concurrent
realtime connections and 2 million messages a month. For three people that
doesn't come close to the ceiling. The thing that runs out first, if anything
does, is storage, since every image you upload stays forever.

One free-plan detail worth knowing: Supabase projects with no access for a week
get paused and need waking up from the dashboard. If a room is going to sit
untouched for months, know that before you send the link to someone.

## Commands

```bash
npm run dev        # development
npm run build      # production build
npm run test       # pure logic tests (games, parsers, sync)
npm run check      # typecheck + lint + tests
```

The tests cover what can be tested without a browser: win detection in the
games, the YouTube link parser, playhead projection, slug normalisation. The
rest (dragging, the player, real sync between two tabs) is tested by hand, with
two windows open side by side.

### GIF and sticker keys (optional)

The gif/sticker panel searches several providers at once, so when one doesn't
have what you're after the others fill in. Set up at least one:

- **Tenor** (gifs and stickers, the most generous free allowance by a distance;
  worth having as the one that is still answering late in the day): key from
  the Google Cloud console → `NEXT_PUBLIC_TENOR_KEY`.
- **Giphy** (gifs plus transparent stickers): free key at
  [developers.giphy.com](https://developers.giphy.com) → `NEXT_PUBLIC_GIPHY_KEY`.
- **Klipy** (gifs and stickers, Discord style): key at
  [partner.klipy.com](https://partner.klipy.com) → `NEXT_PUBLIC_KLIPY_KEY`.

Put them in `.env.local` locally, or in your host's environment variables for
the deploy. With no key at all the panel just shows a note and everything else
works normally.

These keys are metered. A free Giphy key is roughly 100 requests an hour and
1000 a day, and one search spends two of them per provider (gifs and stickers
are separate calls). Run out and Giphy answers 429, or 403 once the day is
gone; the panel says so in those words rather than pretending the search found
nothing, and it comes back on its own. A key the provider refuses outright is
reported differently, because that one never recovers on its own. Searches are remembered for the visit so
reopening the panel costs nothing. Two providers configured means one running
dry still leaves you with gifs.

A note on Klipy: their API sends no CORS headers, so the search goes through a
small proxy of our own (`functions/api/klipy.js`, a Pages Function at
`/api/klipy`) instead of calling `api.klipy.com` directly. It reuses the same
`NEXT_PUBLIC_KLIPY_KEY` (or a server-only `KLIPY_KEY` if you prefer), so there's
nothing new to configure. Because it's a Pages Function, Klipy only works on the
published site, not in local `npm run dev`.

## Sharing a tab live (WebRTC)

The "share a tab" item (the monitor-with-an-arrow button in the dock) is the
free, realtime way to show a site, game or song to the room:

- Whoever clicks "pick a tab and share" chooses a tab from **their own browser**,
  with their own logins, in the browser's picker. That solves the
  YouTube/Spotify problem: it runs in that person's tab, so logins and players
  just work.
- Video and sound go out live, peer to peer (WebRTC), to everyone in the room.
  Signalling rides the Supabase channel; no video ever touches the database.
- One at a time, arcade style: whoever is sitting there shares, everyone else
  watches. "Take over" passes the turn, and the previous sharer stops on its own.

One honest caveat: the P2P connection uses public **STUN** servers only, which
connect most home networks directly. A minority of stricter networks need a
**TURN** relay, which isn't reliably free. If the picture never arrives between
two people, that's why, and a TURN (Cloudflare Calls, Metered) can be plugged in
later.

The difference from the shared browser (Hyperbeam): there **both people control**
the same cloud browser (paid); here **one person shares** their own tab and the
others watch (free). Both exist side by side.

## On "sharing a website" in realtime

You can paste a link and have everyone see the same window, and you can **watch
together** with real sync (YouTube, Twitch, Vimeo: play, pause and seek land for
everyone). What you **can't** do for free is have two people *control the same
arbitrary site at once*, scrolling, clicking and typing together on someone
else's page. That's a browser security boundary: a page can't read or drive what
happens inside a cross-origin iframe.

Apps that do it (Here.fm included) run a browser **on a server** and stream the
pixels.

That's implemented here as an optional item ("shared browser" in the dock) using
[Hyperbeam](https://hyperbeam.com). It's the only paid part, and it stays off
until you paste your own key in. The walkthrough, including the cost brakes, is
in [COBROWSE.md](COBROWSE.md). Without a key the rest of the app is unaffected.

## Things left out

- Two strokes drawn at the same instant (board or wall): last save wins. With
  three people that's rare and cheap to live with.
- No history and no undo that crosses sessions. Once it's gone, it's gone.
- Sites sending `X-Frame-Options: DENY` won't open in the iframe window. Nothing
  can be done about that from the client side, which is why every embed has a
  button to open it in a new tab.
