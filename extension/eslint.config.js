import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "artifacts/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { browser: "readonly" } },
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
