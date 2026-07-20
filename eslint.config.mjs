import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "functions/**"],
  },
  {
    rules: {
      // Room decorations are arbitrary remote URLs, so next/image is not a fit.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
