import js from "@eslint/js";
import markdown from "@eslint/markdown";
import preferences from "eslint-plugin-markdown-preferences";
import paragraph from "eslint-plugin-markdown-preferences-paragraph";
import yml from "eslint-plugin-yml";
import proseSpellcheck from "./src/index.js";

export default [
  { ignores: ["coverage/**", "test/fixtures/**", ".spelling-fixture-*/**"] },
  { ...js.configs.recommended, files: ["**/*.js"] },
  ...yml.configs["flat/recommended"],
  {
    files: ["**/*.md"],
    plugins: {
      markdown,
      "markdown-preferences": preferences,
      "markdown-preferences-paragraph": paragraph,
      "prose-spellcheck": proseSpellcheck,
    },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: {
      ...markdown.configs.recommended[0].rules,
      "markdown/no-duplicate-headings": "error",
      "markdown-preferences/heading-casing": ["error", {
        style: "Title Case",
        preserveWords: [
          ...preferences.resources.defaultPreserveWords,
          "eslint-plugin-prose-spellcheck",
          "CSpell",
          "mdast",
          "ESM",
          "UTF-16",
          "0.x",
          "1.x",
          "Data-Driven",
          "Non-Goals",
        ],
      }],
      "markdown-preferences/no-heading-trailing-punctuation": "error",
      "markdown-preferences-paragraph/wrap": ["error", { width: "nowrap" }],
      "prose-spellcheck/spellcheck": ["error", {
        dictionaries: ["@cspell/dict-en_us", "@cspell/dict-software-terms", "./.spellcheck.txt"],
        baseDir: import.meta.dirname,
      }],
    },
  },
];
