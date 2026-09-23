// Uploads a folder of PNGs to the storage bucket, under a prefix:
//
//   node scripts/upload-folder.mjs <folder> <prefix>
//
// e.g. the FireAlpaca brush pictures to brushes/firealpaca/. Reads the
// project's address and public key from .env.local and signs in anonymously,
// as the site does. Files already there are left alone.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [folder, prefix] = process.argv.slice(2);
if (!folder || !prefix) {
  console.error("usage: node scripts/upload-folder.mjs <folder> <prefix>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signInError } = await supabase.auth.signInAnonymously();
if (signInError) throw signInError;

const bucket = supabase.storage.from("decorations");
const { data: there } = await bucket.list(prefix.replace(/\/$/, ""), { limit: 1000 });
const have = new Set((there ?? []).map((f) => f.name));

let sent = 0;
for (const name of fs.readdirSync(folder).filter((f) => f.endsWith(".png"))) {
  if (have.has(name)) continue;
  const body = fs.readFileSync(path.join(folder, name));
  const { error } = await bucket.upload(`${prefix.replace(/\/$/, "")}/${name}`, body, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error(name, error.message);
    continue;
  }
  sent += 1;
}
console.log(`${sent} sent, ${have.size} already there`);
