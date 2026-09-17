# Live shared browser (Hyperbeam)

This turns on the "shared browser" item in the dock: you paste a link, and
**everyone in the room drives the same browser at the same time**, clicking,
scrolling and typing together over the internet. It's the real co-browsing a
plain iframe can't do.

It runs on [Hyperbeam](https://hyperbeam.com), which keeps a browser in the
cloud and streams it to the room. This is the **only paid part** of nook.
Everything else stays free.

## What's already in the code

- The item itself, the dock button, "change link" and "close session".
- The serverless function (`functions/api/cobrowse.js`) that opens and ends the
  session. It keeps the Hyperbeam key **on the server**, so the key never
  reaches the browser and never lands in the repository.
- Cost brakes: the session ends by itself **3 minutes** after everyone leaves
  (`OFFLINE_TIMEOUT` in the function file), and the close button kills it
  immediately.

All that's left is creating the account and pasting the key in. About ten
minutes.

## Step by step

**1. Create the account and get the key.**
At [hyperbeam.com](https://hyperbeam.com), make an account and grab the **API
key** from the dashboard (usually under Settings / API Keys). Keep it secret.

**2. Put the key in your host, not in the code.**
In the Cloudflare Pages dashboard, go to your project → **Settings →
Environment variables → Production** and add:

- `HYPERBEAM_API_KEY` is the key you just copied. **Mark it as a secret**
  (encrypted).

Then, so only people actually in the room can open a session (which protects
your wallet from abuse), add these two as well. Same Supabase values you
already use, but **without** the `NEXT_PUBLIC_` prefix:

- `SUPABASE_URL` is your Supabase URL
- `SUPABASE_ANON_KEY` is the Supabase anon key

> Skip those two and the shared browser still works, but anyone who opens the
> site could start a session. With them, only people who joined the room can.
> Worth adding.

**3. Run the database migration.**
In Supabase's SQL Editor, run `supabase/migrations/0003_cobrowse.sql` so the
database accepts the new item kind. If you've already run a later migration,
run the newest one last instead, since they redefine the same constraint.

**4. Deploy again.**
A `git push` is enough. The new variables get picked up on the next build.

## Using it

1. In the room, click the **monitor** button (shared browser) in the dock.
2. Select the item, paste a link, open it together.
3. The session comes up and everyone in the room can drive the same browser.
4. "Change link" (the arrows icon) switches sites without wasting a new session.
5. "Close" (the X) ends the session. **Use it when you're done so it doesn't
   bill for nothing.**

## Cost, and not getting a surprise

- Hyperbeam charges **per hour of active session**, not a flat subscription.
  Check their dashboard for current pricing.
- What keeps it cheap: closing the session when you're finished, and the
  3-minute timeout that kills an abandoned one. For something tighter, lower
  `OFFLINE_TIMEOUT` in `functions/api/cobrowse.js` (60 seconds, say).
- Each open "shared browser" item is one session. Don't leave several around.

## One thing worth knowing

The shared browser is a **live session**, not a permanent object. A photo or a
note stays forever; a co-browse session ends when everyone leaves (or when you
close it). When that happens the item shows "session ended" with a button to
open it again. That's the nature of it, not a bug.

## Locally

The `/api/cobrowse` function only exists on the deployed site. Running
`npm run dev` locally, the button will say it isn't configured. That's expected.
Test it on the published site.
