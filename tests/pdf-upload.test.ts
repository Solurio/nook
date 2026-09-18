import test from "node:test";
import assert from "node:assert/strict";

import { PART_MB, PDF_MAX_MB, uploadPdf } from "../src/components/pdf/upload.ts";

const MB = 1024 * 1024;

test("a PDF under the storage limit goes up whole", async () => {
  const sent: File[] = [];
  const file = new File([new Uint8Array(3 * MB)], "rules.pdf", { type: "application/pdf" });
  const up = await uploadPdf(file, async (f) => (sent.push(f), `https://x/${f.name}`));
  assert.deepEqual(up, { src: "https://x/rules.pdf", bytes: 3 * MB });
  assert.equal(sent.length, 1);
});

test("a big PDF goes up in parts that join back into the same bytes", async () => {
  const bytes = new Uint8Array((PART_MB + 1) * MB);
  for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i % 251;
  const sent: File[] = [];
  const steps: string[] = [];
  const up = await uploadPdf(
    new File([bytes], "book.pdf", { type: "application/pdf" }),
    async (f) => (sent.push(f), `https://x/${f.name}`),
    (done, total) => steps.push(`${done}/${total}`),
  );
  assert.ok(!("error" in up));
  assert.equal(sent.length, 2);
  assert.deepEqual(steps, ["0/2", "1/2", "2/2"]);
  assert.ok(sent.every((f) => f.size <= PART_MB * MB && f.type === "application/pdf"));
  const back = new Uint8Array(await new Blob(sent).arrayBuffer());
  assert.equal(back.length, bytes.length);
  assert.deepEqual(back.subarray(0, 10000), bytes.subarray(0, 10000));
  assert.equal(back[back.length - 4096 + ((bytes.length - 1) % 4096 === 0 ? 0 : 0)], bytes[bytes.length - 4096]);
});

test("too big, or not a PDF, is refused before anything is sent", async () => {
  let calls = 0;
  const huge = { name: "a.pdf", type: "application/pdf", size: (PDF_MAX_MB + 1) * MB } as File;
  assert.ok("error" in (await uploadPdf(huge, async () => (calls++, "u"))));
  assert.ok("error" in (await uploadPdf(new File(["x"], "a.txt", { type: "text/plain" }), async () => (calls++, "u"))));
  assert.equal(calls, 0);
});
