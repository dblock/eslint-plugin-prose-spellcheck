import js from "@eslint/js";
import markdown from "@eslint/markdown";

export default [
  { ignores: ["coverage/**", "test/fixtures/**", ".spelling-fixture-*/**"] },
  ...markdown.configs.processor,
  {
    ...js.configs.recommended,
    files: ["**/*.js"],
  },
];
