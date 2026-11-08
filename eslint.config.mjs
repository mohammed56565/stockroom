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
    "next-env.d.ts",
    "dist/**",
    "work/**",
    "outputs/**",
    "tests/.generated/**",
    ".wrangler/**",
    ".vinext/**",
    ".sites-runtime/**",
  ]),
  {
    files: ["frontend/src/components/ui/**/*.{ts,tsx}", "frontend/src/hooks/use-mobile.ts"],
    rules: {
      // shadcn components use framework patterns that differ from app code.
      // Apply their targeted exceptions only to the UI primitives.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
