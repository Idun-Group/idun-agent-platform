// ESLint flat config for the Idun standalone UI.
//
// Slimmed scope (PLAN-3 Task 2):
// - Plain `tseslint.configs.recommended` instead of `strictTypeChecked` +
//   `stylisticTypeChecked`. Type-aware rules need `parserOptions.project`
//   wired to a tsconfig — deferred to a follow-up PR alongside
//   `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` cleanup
//   (UI-001).
// - This config is meant to *load* and surface UI-002 (jsx-a11y) and
//   UI-003 (i18next/no-literal-string) for tooling that reads ESLint
//   configs (e.g. /review-pr). It is not intended for an immediate
//   whole-codebase lint:fix sweep.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import i18next from "eslint-plugin-i18next";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "lib/api/types/**",
      "out/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      i18next,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "i18next/no-literal-string": [
        "warn",
        {
          markupOnly: true,
          ignoreAttribute: ["data-testid", "className", "id"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
