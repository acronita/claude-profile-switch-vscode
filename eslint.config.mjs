import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["out/**", "dist/**", "node_modules/**", "*.vsix"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      eqeqeq: ["error", "always"],
      curly: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // Guard rails matching the security promises in SECURITY.md.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "http", message: "This extension makes no network requests." },
            { name: "https", message: "This extension makes no network requests." },
            { name: "net", message: "This extension makes no network requests." },
            { name: "dgram", message: "This extension makes no network requests." },
            { name: "node:http", message: "This extension makes no network requests." },
            { name: "node:https", message: "This extension makes no network requests." },
            { name: "node:net", message: "This extension makes no network requests." },
            { name: "node:dgram", message: "This extension makes no network requests." },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "This extension makes no network requests." },
        { name: "XMLHttpRequest", message: "This extension makes no network requests." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "child_process",
          property: "exec",
          message: "Use execFile with an argument array so paths cannot be shell-injected.",
        },
      ],
    },
  },
  {
    files: ["src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
