import { test } from "node:test";
import assert from "node:assert/strict";
import { drawIn, learn, t } from "../src/lib/i18n.ts";

test("english is the key, and what nobody translated shows as it is", () => {
  drawIn("en");
  assert.equal(t("sit here"), "sit here");
  assert.equal(t("{name} is thinking", { name: "ana" }), "ana is thinking");
});

test("a translation finds sentences put together elsewhere, names and all", () => {
  learn("pt", {
    "sit here": "sente aqui",
    "{name} is thinking": "{name} está pensando",
    "{what} went down": "{what} caiu",
    "the eight": "a bola oito",
    "{a} of {b}": "{a} de {b}",
    "foul: {why}": "falta: {why}",
    "nothing was hit": "não acertou nada",
  });
  drawIn("pt");
  assert.equal(t("sit here"), "sente aqui");
  assert.equal(t("{name} is thinking", { name: "ana" }), "ana está pensando");
  assert.equal(t("bo is thinking"), "bo está pensando", "put together elsewhere, found by its shape");
  assert.equal(t("the eight went down"), "a bola oito caiu", "the part filled in is translated too");
  assert.equal(t("foul: nothing was hit"), "falta: não acertou nada");
  assert.equal(t("3 of 7"), "3 de 7");
  assert.equal(t("something new entirely"), "something new entirely");
  drawIn("en");
  assert.equal(t("bo is thinking"), "bo is thinking");
});

test("every translation keeps the blanks its english has", async () => {
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const lang of ["pt", "es"] as const) {
    const words = (await import(`../src/lib/i18n/${lang}.ts`)).default as Record<string, string>;
    assert.ok(Object.keys(words).length > 1500, `${lang} is filled in`);
    for (const [english, local] of Object.entries(words)) {
      assert.ok(local.trim(), `${lang}: "${english}" has a translation`);
      assert.equal(holes(local), holes(english), `${lang}: "${english}"`);
    }
  }
});

test("the real tables read naturally, sentences put together included", async () => {
  learn("pt", (await import("../src/lib/i18n/pt.ts")).default);
  learn("es", (await import("../src/lib/i18n/es.ts")).default);
  drawIn("pt");
  assert.equal(t("sit here"), "sente aqui");
  assert.equal(t("round 3: bo is the czar"), "rodada 3: bo é o czar");
  drawIn("es");
  assert.equal(t("sit here"), "siéntate aquí");
  assert.equal(t("round 3: bo is the czar"), "ronda 3: bo es el zar");
  drawIn("en");
});
