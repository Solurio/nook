import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser } from "./support/database.ts";
import { PACKS } from "../src/lib/cah-packs.ts";
import { BLANK, SAT_OUT } from "../src/lib/cah.ts";
import { draftProblem, emptyDraft, explainDeckError, tidyDraft, withCard, withCards, withoutCard } from "../src/lib/decks.ts";

test("writing a deck card by card: new ones on top, no repeats, blanks tidied", () => {
  let deck = emptyDraft("pt");
  deck = withCard(deck, "black", "Por que ___ está aqui?");
  deck = withCard(deck, "white", "Um pato.");
  deck = withCard(deck, "white", "Uma capivara.");
  assert.deepEqual(deck.black, [`Por que ${BLANK} está aqui?`]);
  assert.deepEqual(deck.white, ["Uma capivara.", "Um pato."]);
  assert.equal(withCard(deck, "white", "  um PATO. "), deck, "a repeat, whatever the case");
  deck = withCard(deck, "white", "Um pato de terno.", 1);
  assert.deepEqual(deck.white, ["Uma capivara.", "Um pato de terno."]);
  deck = withoutCard(deck, "white", 0);
  assert.deepEqual(deck.white, ["Um pato de terno."]);
  deck = withCards(deck, "white", "a\nb\n\nb\nc");
  assert.deepEqual(deck.white, ["c", "b", "a", "Um pato de terno."]);
});

test("a deck needs a name and at least a card; the stand-in card never gets in", () => {
  assert.match(draftProblem(emptyDraft()) ?? "", /name/);
  assert.match(draftProblem({ ...emptyDraft(), name: "  " }) ?? "", /name/);
  assert.match(draftProblem({ ...emptyDraft(), name: "mine" }) ?? "", /no cards/);
  assert.equal(draftProblem({ ...emptyDraft(), name: "mine", white: ["x"] }), null);
  const tidy = tidyDraft({ ...emptyDraft(), name: "  my   deck ", white: [SAT_OUT, "x", "X"], black: ["a __ b"] });
  assert.equal(tidy.name, "my deck");
  assert.deepEqual(tidy.white, ["x"]);
  assert.deepEqual(tidy.black, [`a ${BLANK} b`]);
});

test("the after-dark packs are there, marked, and off unless picked", () => {
  assert.equal(PACKS["en-adult"].adult, true);
  assert.equal(PACKS["pt-adult"].adult, true);
  assert.equal(PACKS.en.adult, undefined);
});

test("a missing table reads as the migration to run", () => {
  assert.match(explainDeckError('relation "public.decks" does not exist'), /0007_decks/);
  assert.match(explainDeckError("Could not find the table 'public.decks' in the schema cache"), /0007_decks/);
  assert.match(explainDeckError("new row violates row-level security policy"), /copy/);
});

let db: PGlite;

before(async () => {
  db = await freshDatabase();
});

test("decks: everyone reads them, only their maker changes or deletes them", async () => {
  const [maker, other] = await Promise.all([newUser(db), newUser(db)]);
  const run = (user: string, sql: string, params: unknown[] = []) => as(db, user, (tx) => tx.query(sql, params));
  const { rows } = await run(maker, "insert into public.decks (author, name, language, black, white) values ('ana', 'ours', 'pt', $1::jsonb, $2::jsonb) returning id, black_count, white_count, owner_id", [
    JSON.stringify(["Por que ____?"]),
    JSON.stringify(["Sopa.", "Abelhas?"]),
  ]);
  const deck = rows[0] as { id: string; black_count: number; white_count: number; owner_id: string };
  assert.equal(deck.owner_id, maker);
  assert.equal(deck.black_count, 1);
  assert.equal(deck.white_count, 2);

  const { rows: seen } = await run(other, "select name, white_count from public.decks where id = $1", [deck.id]);
  assert.deepEqual(seen, [{ name: "ours", white_count: 2 }]);

  // Somebody else: the update and delete touch nothing.
  await run(other, "update public.decks set name = 'mine now' where id = $1", [deck.id]);
  await run(other, "delete from public.decks where id = $1", [deck.id]);
  const { rows: still } = await db.query<{ name: string }>("select name from public.decks where id = $1", [deck.id]);
  assert.deepEqual(still, [{ name: "ours" }]);
  // Nor can a deck be made in someone else's name.
  await assert.rejects(run(other, "insert into public.decks (owner_id, name) values ($1, 'forged')", [maker]));

  // The maker can, and cannot hand it away while at it.
  await run(maker, "update public.decks set name = 'renamed', white = $2::jsonb, owner_id = $3 where id = $1", [deck.id, JSON.stringify(["Sopa."]), other]);
  const { rows: after } = await db.query<{ name: string; white_count: number; owner_id: string }>("select name, white_count, owner_id from public.decks where id = $1", [deck.id]);
  assert.deepEqual(after, [{ name: "renamed", white_count: 1, owner_id: maker }]);
  await run(maker, "delete from public.decks where id = $1", [deck.id]);
  const { rows: gone } = await db.query("select 1 from public.decks where id = $1", [deck.id]);
  assert.equal(gone.length, 0);
});

test("a deck with no name, or far too many cards, is refused", async () => {
  const user = await newUser(db);
  const run = (sql: string, params: unknown[] = []) => as(db, user, (tx) => tx.query(sql, params));
  await assert.rejects(run("insert into public.decks (name) values ('')"));
  await assert.rejects(run("insert into public.decks (name, white) values ('big', $1::jsonb)", [JSON.stringify(Array.from({ length: 2001 }, (_, i) => `c${i}`))]));
  await assert.rejects(run("insert into public.decks (name, language) values ('x', 'klingon')"));
});
