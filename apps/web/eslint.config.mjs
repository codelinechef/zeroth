import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wrangler writes throwaway middleware bundles under .wrangler/tmp on every
    // `wrangler dev`. They are generated, they are gitignored, and linting them
    // reports unused-variable warnings against code nobody wrote.
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
