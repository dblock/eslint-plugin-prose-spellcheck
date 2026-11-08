<img src="assets/logo.png" alt="Pen-and-ink finch perched on a dictionary beside a pencil" width="160">

# eslint-plugin-prose-spellcheck

[![Test](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml) [![Package](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml) [![Coverage](https://coveralls.io/repos/github/dblock/eslint-plugin-prose-spellcheck/badge.svg?branch=master)](https://coveralls.io/github/dblock/eslint-plugin-prose-spellcheck?branch=master)

Offline Markdown prose spellchecking for native ESLint Markdown, powered by CSpell.

Checks native Markdown prose, headings, visible link labels, and image descriptions without spelling fixes or suggestions. Dictionaries are loaded offline when the rule starts.

## Installation

Requires Node.js 22.18.0 or later in the 22.x series, or Node.js 24 or later. Install alongside ESLint and its Markdown language plugin:

```sh
npm install --save-dev eslint @eslint/markdown eslint-plugin-prose-spellcheck@0.1.2
```

## Usage

In `eslint.config.js`:

```js
import markdown from "@eslint/markdown";
import proseSpellcheck from "eslint-plugin-prose-spellcheck";

export default [{
  files: ["**/*.md"],
  plugins: { markdown, "prose-spellcheck": proseSpellcheck },
  language: "markdown/gfm",
  languageOptions: { frontmatter: "yaml" },
  rules: { "prose-spellcheck/spellcheck": "error" },
}];
```

First, gather unknown words into a candidate vocabulary file using this ESLint configuration:

```sh
npx eslint-prose-spellcheck collect "**/*.md" --output .spellcheck.txt
```

Review `.spellcheck.txt` and remove misspellings. Keep only intentional names and project terms that should be accepted; do not exclude every reported word. Collection never overwrites existing files or edits your source or configuration.

Then replace the `rules` object in your Markdown configuration with:

```json
{
  "prose-spellcheck/spellcheck": ["error", {
    "dictionaries": ["@cspell/dict-en_us", "./.spellcheck.txt"]
  }]
}
```

This keeps English enabled and adds your reviewed vocabulary. Run spellchecking again to find the remaining typos:

```sh
npx eslint "**/*.md"
```

Reviewed words are now accepted; fix remaining misspellings in the source. Unknown words are ordinary ESLint diagnostics, and native ESLint disable comments apply using `prose-spellcheck/spellcheck`. Code, destinations, URLs, email addresses, recognized front matter, and matched Liquid expressions/tags are excluded, not entire surrounding paragraphs.

For collection, omit `--output` to print candidates, or pass `--config path` to select an ESLint configuration. If a vocabulary file already exists, collect into a different file and review additions before merging them.

To find a candidate in its source before accepting it, use `--context`:

```sh
npx eslint-prose-spellcheck collect "**/*.md" --context
```

This prints each sorted candidate followed by a tab and its first `file:line:column` location. Files are considered in lexical path order, with paths relative to the working directory using `/` separators; lines and original UTF-16 columns start at one. Only unsuppressed spelling diagnostics are included. Context reports are for review, not vocabulary files; `--context` cannot be combined with `--output`.

## Configuration

### `dictionaries`

`dictionaries` defaults to bundled US English; an explicit nonempty list replaces that default. Additional installed CSpell dictionary packages can add software terminology or other languages. Include `@cspell/dict-en_us` explicitly to retain English when adding packages or vocabulary files.

Custom vocabulary is configured through reviewed `.txt` files, with one case-sensitive word per line; blank lines and `#` comments are ignored. Straight/curly apostrophes are equivalent; list additional inflections explicitly.

### `baseDir`

`baseDir` defaults to ESLint's working directory and controls consumer package and relative vocabulary resolution. Relative `baseDir` paths also resolve from ESLint's working directory.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md), [CHANGELOG.md](CHANGELOG.md), [RELEASING.md](RELEASING.md), and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Runtime dictionaries and dependencies retain their own licenses.
