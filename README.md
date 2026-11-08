<img src="assets/logo.png" alt="Pen-and-ink finch perched on a dictionary beside a pencil" width="160">

# eslint-plugin-prose-spellcheck

[![Test](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml) [![Package](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml) [![Coverage](https://coveralls.io/repos/github/dblock/eslint-plugin-prose-spellcheck/badge.svg?branch=master)](https://coveralls.io/github/dblock/eslint-plugin-prose-spellcheck?branch=master)

Offline Markdown prose spellchecking for native ESLint Markdown, powered by CSpell.

Unreleased. Checks native Markdown prose, headings, visible link labels, and image descriptions without spelling fixes or suggestions. Dictionaries are loaded offline before ESLint runs. See [DESIGN.md](DESIGN.md) for scope and limitations.

## Installation

Requires Node.js 22.18.0 or later in the 22.x series, or Node.js 24 or later. Until publication is authorized, install a locally built archive alongside ESLint and its Markdown language plugin:

```sh
npm install --save-dev eslint @eslint/markdown ./eslint-plugin-prose-spellcheck-0.1.0.tgz
```

## Usage

In `eslint.config.js`:

```js
import markdown from "@eslint/markdown";
import { createPlugin } from "eslint-plugin-prose-spellcheck";

export default [{
  files: ["**/*.md"],
  plugins: { markdown, "prose-spellcheck": await createPlugin() },
  language: "markdown/gfm",
  languageOptions: { frontmatter: "yaml" },
  rules: { "prose-spellcheck/spellchecker": "error" },
}];
```

Run `npx eslint "**/*.md"`. Unknown words are ordinary ESLint diagnostics; native ESLint disable comments apply. Code, destinations, URLs, email addresses, recognized front matter, and matched Liquid expressions/tags are excluded, not entire surrounding paragraphs.

## Configuration

Pass options to the asynchronous factory, not the rule:

```js
import { createPlugin } from "eslint-plugin-prose-spellcheck";

export const plugin = await createPlugin({
  dictionaries: ["@cspell/dict-en_us", "./.spellcheck.txt"],
  baseDir: import.meta.dirname,
  words: ["MyProduct"],
});
```

`dictionaries` defaults to bundled US English; an explicit nonempty list replaces that default. Additional installed CSpell dictionary packages can add software terminology or other languages. `baseDir` defaults to the working directory and controls consumer package and relative vocabulary resolution. Local `.txt` files contain one case-sensitive word per line; blank lines and `#` comments are ignored. Inline `words` are also case-sensitive. Both vocabulary forms preserve case and treat straight/curly apostrophes equivalently; list additional inflections explicitly.

Collect candidates with your actual ESLint configuration:

```sh
npx eslint-prose-spellcheck collect "**/*.md" --output .spellcheck.txt
```

Review the file, remove typos, and manually add it to `dictionaries`. Existing files are never overwritten; source and configuration are never edited. Omit `--output` to print candidates, or pass `--config path` to select an ESLint configuration. See DESIGN for collection errors and exclusions.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md), [CHANGELOG.md](CHANGELOG.md), [RELEASING.md](RELEASING.md), and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Runtime dictionaries and dependencies retain their own licenses.
