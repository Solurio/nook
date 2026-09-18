// A real Postgres to run the migrations against, in-process, so the row level
// security and the pile functions are tested by the database that enforces
// them rather than by a mock that agrees with whatever the code assumes.
//
// PGlite is Postgres compiled to WASM. What it lacks is Supabase's own
// scaffolding -- the auth schema, the API roles, storage -- so those are
// stubbed here with the same names and the same behaviour the migrations rely
// on, and nothing more.

import { readFileSync, readdirSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

const SCAFFOLD = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key);

  -- Supabase reads the caller from the request's JWT; here it is a setting.
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;

  create publication supabase_realtime;
`;

// What Supabase grants its API roles out of the box.
const GRANTS = `
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SCAFFOLD);

  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }

  await db.exec(GRANTS);
  return db;
}

/** A user id that exists in auth.users, as an anonymous sign-in would make. */
export async function newUser(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id) values (gen_random_uuid()) returning id",
  );
  return rows[0].id;
}

/**
 * Runs something as a signed-in visitor: the authenticated role, with row
 * level security in force and auth.uid() answering with this user.
 */
export async function as<T>(
  db: PGlite,
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return work(tx);
  });
}

/** A room and a game item in it, owned by the given user. */
export async function tableFor(db: PGlite, ownerId: string, game = "cards") {
  const room = await db.query<{ id: string }>(
    "insert into public.rooms (slug, owner_id) values ($1, $2) returning id",
    [`t-${Math.random().toString(36).slice(2, 10)}`, ownerId],
  );
  const item = await db.query<{ id: string }>(
    `insert into public.items (room_id, kind, data)
     values ($1, 'game', $2::jsonb) returning id`,
    [room.rows[0].id, JSON.stringify({ game, state: {} })],
  );
  return { roomId: room.rows[0].id, itemId: item.rows[0].id };
}
