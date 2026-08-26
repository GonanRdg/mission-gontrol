import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "artifacts/**",
      "build/**",
      "dist/**",
      "dist-electron/**",
      "dist-electron-out/**",
      "node_modules/**",
      "publish/**",
      "test-results/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-case-declarations": "off",
      "no-control-regex": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-undef": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "warn",
      "prefer-const": "off",
      "preserve-caught-error": "off",
      "react/no-danger": "off",
      "react-hooks/exhaustive-deps": "off",
      // Catches a hook placed after an early return — the renderer throws
      // "Rendered more hooks than during the previous render" at runtime.
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Two pre-existing naming clashes the rule can't see through:
    //   project-fs.ts — `useSandboxFs` is a plain async helper, not a hook.
    //   MarkdownPreview.tsx — react-markdown's component overrides are real
    //   components, but named h1/p/li, so hook calls inside them look illegal.
    files: ["src/lib/project-fs.ts", "src/components/views/MarkdownPreview.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["electron/**/*.ts", "scripts/**/*.mjs", "vite*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
