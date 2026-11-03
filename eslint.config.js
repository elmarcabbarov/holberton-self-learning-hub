import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import { builtinModules } from "node:module";

const NODE_BUILTINS = builtinModules.flatMap((m) => (m.startsWith("node:") ? [m] : [m, `node:${m}`, `${m}/*`, `node:${m}/*`]));

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: to.map((type) => ({ to: { element: { type } } })),
});

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "playwright-report/**", "test-results/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      // First match wins: specific folders before their parents.
      "boundaries/elements": [
        { type: "contracts", pattern: "packages/contracts", partialMatch: false },
        { type: "server-ai", pattern: "apps/server/src/modules/ai", partialMatch: false },
        { type: "server-tutor", pattern: "apps/server/src/modules/tutor", partialMatch: false },
        { type: "server-drafts", pattern: "apps/server/src/modules/drafts", partialMatch: false },
        // Composition root: the only server code that may wire optional modules in (ADR-007).
        { type: "server-root", pattern: "apps/server/src/compose", partialMatch: false },
        { type: "server-research", pattern: "apps/server/src/modules/research", partialMatch: false },
        // Server tests may exercise optional modules directly.
        { type: "server-test", pattern: "apps/server/test", partialMatch: false },
        { type: "server", pattern: "apps/server", partialMatch: false },
        { type: "web", pattern: "apps/web", partialMatch: false },
        { type: "e2e", pattern: "e2e", partialMatch: false }
      ]
    },
    rules: {
      // Default-deny: every allowed dependency direction is listed explicitly (D-019).
      "boundaries/dependencies": ["error", {
        default: "disallow",
        policies: [
          allow("contracts", ["contracts"]),
          allow("web", ["web", "contracts"]),
          allow("server", ["server", "server-root", "contracts"]),
          allow("server-root", ["server", "server-ai", "server-tutor", "server-drafts", "contracts"]),
          allow("server-test", ["server-test", "server", "server-root", "server-ai", "server-research", "server-tutor", "server-drafts", "contracts"]),
          allow("server-tutor", ["server-tutor", "server", "contracts"]),
          allow("server-drafts", ["server-drafts", "server", "contracts"]),
          allow("server-ai", ["server-ai", "server", "contracts"]),
          allow("server-research", ["server-research", "server-ai", "server", "contracts"]),
          allow("e2e", ["e2e", "contracts"])
        ]
      }]
    }
  },
  {
    // Core server code must not reach into optional AI/research modules.
    files: ["apps/server/src/**/*.ts"],
    ignores: ["apps/server/src/modules/ai/**", "apps/server/src/modules/research/**", "apps/server/src/modules/tutor/**", "apps/server/src/modules/drafts/**", "apps/server/src/compose/**", "apps/server/src/app.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/modules/ai/**", "**/modules/research/**", "**/modules/tutor/**", "**/modules/drafts/**", "**/compose/**"], message: "Core must not depend on AI/research/tutor/drafts or the composition root (ADR-007)." }] }]
    }
  },
  {
    // Browser-safe code: no Node built-ins.
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/contracts/src/**/*.ts"],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["node:*", ...NODE_BUILTINS], message: "Node built-ins are not allowed in browser-safe code (D-019)." }] }]
    }
  },
  {
    files: ["apps/server/**/*.ts", "e2e/**/*.ts", "*.config.{js,ts}", "**/*.config.{js,ts}"],
    languageOptions: { globals: globals.node }
  }
);
