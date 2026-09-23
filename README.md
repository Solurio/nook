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
- **Games with hidden cards.** **UNO**, **Coup** (with the Inquisitor, the
  Reformation, guessing to eliminate and the two-player table), **BANG! The Dice
  Game** (five dice rolled for everyone to see, arrows and the Indians, dynamite,
  the Gatling, all sixteen characters, and hidden roles),
  **Spyfall**, **The Resistance**, **Codenames** in English or Portuguese,
  **dominoes**, **Buckshot Roulette** and **WAR** -- the Brazilian one, on any
  map: the classic 42 territories, ancient Greece, or a world a table makes
  itself, with its own continents, territories, borders, outlines and a picture
  underneath. Objectives name the map's own continents; the rules (reinforcements,
  trades, dice, cards, secret objectives or last one standing) are the table's
  to set. Maps are saved for everyone. **Cards Against
  Humanity** with starter cards written for this project, in English and
  Portuguese, an after-dark pack of each for grown-ups, and decks anyone can
  write card by card and save for everyone who uses the site -- ticked before a
  game or added in the middle of one. Answers go in face down and turn over together, mixed, so the czar
  never knows whose is whose. **Catan** for two to four, on a new island every
  game: setup round and back, the robber, harbours, trading with the table,
  the longest road, the largest army, and development cards from a hidden
  deck. Your hand is yours alone; see
  [Hidden cards](#hidden-cards) for how.
- **Board games.** Chess (with check, mate and castling), checkers, connect four,
  tic-tac-toe, **Quoridor** (Bloqueio here in Brazil) for two or four, with walls
  that can never shut anyone in, **rock paper scissors** for two to six with sealed throws,
  **intransitive** (a race where the pieces beat each other in a circle instead
  of a ladder), and **Bomb Party** in English, Portuguese or Spanish: five-letter
  words, checked against a dictionary of each (see `public/words/NOTICE.txt`).

  Every game has chairs. Sit in one and the turns are yours; leave them all
  empty and whoever is holding the device plays every side, which is how one
  phone gets passed round a room. A phone holding more than one hand asks before
  it shows each one. The board turns to face whichever chair you took.
- **Pool**, on a nine-foot table: **eight ball**, **nine ball** or a **free
  table** with no rules at all, for two to eight players, on their own or in two
  sides. The balls slide before they roll, which is why a stun shot stops dead,
  a follow carries on and a screw shot comes back; side spin shows off the
  cushions and throws the ball it hits. Pull the cue back from the ball and let
  go; the dot on the little cue ball is where the tip strikes. Fouls, ball in
  hand and halves picked up as they fall are all kept -- and the free table is
  where you set the balls out by hand. A shot is an angle, a weight and where
  it was struck, so every screen plays out the same table from the same numbers.
- **A card table** for anything else: any deck (52, 54, 40, canasta, **tarot**
  with reversals -- the tarot on the games menu comes with its 78 already laid
  out -- or cards you make yourself, with your own backs), stacks you
  drag, merge, split, cut, shuffle and deal from, face up or face down, and
  hands held in a fan. Pick up several cards at once to play, give or lay them
  down together; pick cards out of a spread to take, or swap them for what you
  are holding; put your hand in whatever order you like, which is kept on your
  own device. Two people moving cards at once cannot leave a card in two places:
  a save that would land on top of a newer one is refused and worked out again.
- **Things for the table.** **Dice** that take real notation (`2d6+3`,
  `4d6kh3`, `d20x2`, `(1d8+2)/2`, `3dF`, exploding `d6!`), land die by die in
  their proper shapes and tell you the range and the average before you roll. A
  **coin** with faces and metal of your choosing. A **wheel** whose slices are
  as wide as their chance of coming up, which lands on the same spot on every
  screen and can make winners sit out. **Pieces** and **grids** (squares or
  hexes, over a map if you like): a piece let go over a grid settles into its
  cell. A grid **measures** in feet or metres -- however much ground a square
  stands for -- and holds **areas** for everyone to see: circles, cones, cubes
  and lines, the way a tabletop RPG needs them.
- **Tying things together.** Tie any item to any other from its bar, a map to its
  pieces or a note to its photo, and dragging one moves them all.
- **Documents.** A PDF laid on the table **as a book**, the cover alone and then
  spreads, pages turning over in 3D, or **on a clipboard** a sheet at a time.
  Everyone reads the same page unless you choose to read on your own. Search,
  the document's own contents, bookmarks, links inside and out, and a layer to
  draw, highlight and pin notes on that belongs to the room rather than the file.
  Pages are only fetched and drawn as they are looked at. Up to 200MB: anything
  over the storage limit of 50MB a file goes up in parts and is joined back
  together to read.
- **A radio.** A player loaded with a playlist, on repeat for the whole room. The
  songs live in the project's own storage (`music/omori/` in the decorations
  bucket), not in this repository; `src/lib/radio.ts` only lists their names.
- **Paint studio.** A painting app in the room, in the spirit of ibisPaint and
  Clip Studio, with everyone drawing on the same picture at once.
  - **Brushes.** Nineteen of them (ink, pencil, crayon, watercolour, airbrush,
    spray, calligraphy, pixel and more), and a brush editor to make your own:
    tip, hardness, spacing, jitter, scatter, taper, grain and pressure. The ones
    you make are kept on the board for everyone.
  - **Tools.** Smudge, blur and liquify for pushing paint around, a paint
    bucket with tolerance, a "this layer or all layers" choice and gap closing,
    gradients, shapes, text with the room's fonts, an eyedropper, symmetry up
    to a kaleidoscope, and a stabiliser for steady lines.
  - **Selections.** Box, ellipse, lasso and a magic wand. You can add to one or
    take away from it, invert it, fill it, clear it, filter it, copy or cut it
    to a new layer, and move, scale, turn and flip what is inside.
  - **Layers.** Blend modes, opacity, clipping, alpha lock, locking, effects
    (blur, brightness, contrast, saturation, hue, sepia and more), reordering,
    duplicating and merging.
  - **Colour.** A colour wheel, a second colour to swap to, the colours you
    used last, and palettes you can build and share.
  - **Files.** Export PNG (with or without the paper, or at twice the size),
    JPG, or a looping gif of the picture being made. A project file saves the
    layers and history and opens again later. Pictures can be pasted or dropped
    in as layers.
  - **Canvas.** Zoom, turn and mirror the view without touching the picture;
    two fingers pinch, and a two-finger tap undoes. A graphics tablet gets
    pressure and palm rejection. There is a full-screen mode, and the usual
    keyboard shortcuts (B, E, G, M, W, V, ctrl+Z and so on).
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

### Hidden cards

A card game needs something a shared state cannot give: a hand only you can
see. Everything else in a room is one JSON document everyone receives, so
anything put there, a hidden flag or not, reaches every browser.

So secrets live somewhere else. `secrets` is a table of piles: a hand, a deck,
a role, a sealed vote. Row level security lets you read a pile only if it is
yours, and nobody can write one directly. Every move is a Postgres function
(`pile_setup`, `pile_deal`, `pile_draw`, `pile_move`, `pile_reveal`,
`pile_peek`, `pile_test`, and a few more) that checks the move and does it in one
transaction, then writes what the table is allowed to know back onto the item:
how many cards each pile holds, and whatever has been turned over.

- A deck is shuffled in the database, and nobody reads it, the dealer included.
- Turning a card over is a public act. So is peeking (Buckshot's magnifying
  glass), and asking whether a hand holds a card (Coup's embezzlement): the
  table is told it happened, not what was seen.
- Sealed piles (votes, missions, rock paper scissors) only turn over once every
  one is in.
- A pile dealt to an empty chair belongs to whoever dealt it, and is handed to
  whoever sits down.
- A browser saving a game cannot touch the pile sizes or claim a card was
  turned over: a trigger puts those keys back unless one of the functions wrote
  them.

The functions are tested against a real Postgres running in WebAssembly
([PGlite](https://pglite.dev)), with the same migrations and the same policies.

### Stack

Next.js 16 (App Router) with React 19, TypeScript, Tailwind v4, and Zustand for
room state. Supabase for the rest. [pdf.js](https://mozilla.github.io/pdf.js/)
reads PDFs, loaded only when one is on the table; its worker is copied out of
`node_modules` before every dev run and build (`scripts/copy-pdf-worker.mjs`). It's exported as a static site
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

You need Node 22+ and a Supabase project (the free plan is enough).

**1. Create the Supabase project.** At [supabase.com](https://supabase.com),
create a new project. Pick the region closest to you, it feeds straight into
realtime latency.

**2. Run the migrations.** Open the project's SQL Editor and run the contents of
`supabase/migrations/` in order. All of them, including the newest: `0009`
gives the paint studio a table of its own, so each stroke is one small row
instead of a rewrite of the whole picture. Without it the studio still works,
but keeps everything inside the board and slows down as the picture grows.
`0008` keeps the WAR maps people make, and `0007` the Cards Against Humanity
decks people write, both for everyone. `0006`
creates the secret piles every hidden-card game runs on, adds pieces, grids and
documents, and lets the upload bucket take PDFs. Without it those games say so
instead of dealing. `0005` widens what the upload bucket accepts, and without it
a photo straight off a phone is refused for being HEIC. The first creates the tables, the RLS policies,
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
npm run test       # logic tests, and the database ones against PGlite
npm run check      # typecheck + lint + tests
```

The tests cover what can be tested without a browser: the rules of every game,
dice notation, the wheel's weights, the PDF book's spreads, grid snapping, the
YouTube link parser, playhead projection, slug normalisation. The secret piles
are tested against a real Postgres (PGlite, in WebAssembly): who can read what,
who can move what, sealed reveals, peeks and tests. The database tests run one
file at a time, since each starts its own Postgres. The rest (dragging, the
player, real sync between two tabs) is tested by hand, with two windows open
side by side.

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

## Honest limits

- **Public moves are trusted.** Hidden information is kept by the database, but
  the moves that change the public state of a game (whose turn it is, what a
  card did) are worked out in the browser and saved. Nobody can see your hand,
  but a determined friend with the developer tools open could cheat at the
  public part. This is a table among friends, not a casino.
- **Dice, coins, wheels and the bomb's fuse** are rolled in the browser of
  whoever rolls them, with the browser's proper random source. Fair, but not
  provably so.
- **Bomb Party only knows five-letter words**, and only the ones on its lists.
  A real word it has never heard of is refused.
- **Fuses and timers** are measured on each person's clock, so a phone whose
  clock is badly off sees the fuse a little early or late.
- **A role that leaves with its phone.** A role is turned over by the device
  that holds it. If that device is gone when it is needed, the role stays hidden.
  The same goes for a WAR objective: only the screen holding it can tell it has
  been reached.

## Next

Prepared for, not built yet: **Catan**, **Detective**
(Clue-style), **Werewolf** and **Monopoly**, all of which fit the secret piles
and the chairs as they are. An inventory for pieces, typing shown live to the
table, and a proper undo.

## Things left out

- Two strokes drawn at the same instant (board or wall): last save wins. With
  three people that's rare and cheap to live with.
- No history and no undo that crosses sessions. Once it's gone, it's gone.
- Sites sending `X-Frame-Options: DENY` won't open in the iframe window. Nothing
  can be done about that from the client side, which is why every embed has a
  button to open it in a new tab.
