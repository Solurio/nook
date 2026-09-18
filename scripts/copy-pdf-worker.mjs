// pdf.js reads documents in a worker, which has to be its own file served
// next to the site. Copied out of node_modules before every dev run and build,
// so it is always the same version as the library that talks to it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(source, join("public", "pdf.worker.min.mjs"));
