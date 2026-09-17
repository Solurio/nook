# Putting nook online

The site exports as a pile of static files (`out/`), with no server. That means
it hosts anywhere that serves static files, for free, and the link keeps working
forever without anyone having to run anything. Your friends just type the
address.

No secrets live in the repository. The two environment variables are set in your
host's dashboard, not in the code. Supabase's `anon` key is public by nature (it
ends up embedded in the JavaScript either way), and what protects the data is
RLS, not keeping that key quiet.

Before anything else, run the database migrations (see the README). Without the
`strokes` table from migration `0002`, drawing on the room doesn't save.

## Option A: Cloudflare Pages (recommended)

Free, with a fixed address like `nook.pages.dev`.

1. In [dash.cloudflare.com](https://dash.cloudflare.com) go to **Workers & Pages**
   → **Create** → **Pages** → **Connect to Git**. Authorise, then pick the repo.
2. Build settings:
   - **Framework preset:** Next.js (Static HTML Export). If that preset isn't
     there, use "None" and fill it in by hand.
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
3. Under **Environment variables** (Production), add both:
   - `NEXT_PUBLIC_SUPABASE_URL` is your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon/publishable key
4. **Save and Deploy.**

That's it. Every `git push` to `main` deploys on its own.

If a deploy seems to not pick up your latest commit, check the Deployments tab:
the card on top should show the newest commit hash. Hitting "Retry deployment"
on an older card republishes *that* old commit over the new one, which looks
exactly like a build that silently failed.

## Option B: Vercel

Also free. The address comes out as `nook-xxxx.vercel.app`.

1. At [vercel.com/new](https://vercel.com/new), import the repo.
2. Vercel detects Next.js. You don't need to touch the build; `output: "export"`
   in `next.config.ts` makes it serve the static files.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Deploy.**

## What "private" means here

The site's *address* is reachable by anyone who has it. You can't lock the page
itself behind a free plan. That leaks nothing, though: the page is only the
shell of the app. What matters are the **rooms**, and each room has a slug you
can't guess (something like `cocoa-willow-7fk2`) protected by RLS in the
database. Nobody gets into a room without its link. Same model as Here.fm: the
link is the key.

If you want to lock one down for good, the room's owner has a padlock at the
top. With it closed, only the owner edits.

## Your own domain (optional)

Cloudflare and Vercel both let you point a domain at it for free (you only pay
to register the domain, if you want one). On both it's under **Custom domains**
inside the project.

## Running locally

```bash
cp .env.example .env.local   # then fill in the two keys
npm install
npm run dev                  # http://localhost:3000
```
