import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    // out/ is the built site; the pdf.js worker is copied into public/ from node_modules.
    ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts", "functions/**", "public/pdf.worker.min.mjs"],
  },
  {
    rules: {
      // Room decorations are arbitrary remote URLs, so next/image is not a fit.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
