# eslint-plugin-prose-spellcheck

[![Test](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/lint.yml) [![Package](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml/badge.svg)](https://github.com/dblock/eslint-plugin-prose-spellcheck/actions/workflows/package.yml) [![Coverage](https://coveralls.io/repos/github/dblock/eslint-plugin-prose-spellcheck/badge.svg?branch=master)](https://coveralls.io/github/dblock/eslint-plugin-prose-spellcheck?branch=master)

Offline Markdown prose spellchecking for native ESLint Markdown, powered by CSpell.

This is an unpublished scaffold. Spellchecking and vocabulary collection are not implemented. The approved first-version scope is recorded in [DESIGN.md](DESIGN.md).

## Installation

Development requires Node.js 22.18.0 or later in the 22.x series, or Node.js 24 or later. From a checkout, install the locked dependencies:

```sh
npm ci
```

## Usage

There is no working spellchecker rule or collection command yet. The scaffold validates package imports, native Markdown integration, documentation linting, and the packed-package consumer harness; it does not check spelling.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md), [CHANGELOG.md](CHANGELOG.md), [RELEASING.md](RELEASING.md), and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Runtime dictionaries and dependencies retain their own licenses.
