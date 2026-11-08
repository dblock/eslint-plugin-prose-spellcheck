# Design

## Status and Purpose

The scaffold exports an ESLint plugin identity with an empty rule registry. It contains no spelling implementation or collection executable. The sections below describe the approved first functional version, not currently available behavior.

Provide one native ESLint Markdown rule, `prose-spellcheck/spellchecker`, and a read-only vocabulary collection command. Use ESLint's file selection, configuration, severity, ignore rules, suppression comments, and diagnostic formats rather than introducing another documentation linter.

## Prior Art

The motivating [paragraph-wrap PR #4](https://github.com/dblock/eslint-plugin-markdown-preferences-paragraph-wrap/pull/4) established that `@cspell/eslint-plugin` listens for JavaScript `Program` nodes and misses native Markdown prose. Its local documentation plugin uses public CSpell APIs, but raw-text checking does not establish correct decoded entity locations or exclusion of URLs inside paragraphs. Its first-heading and final-newline rules are unrelated and are not carried over.

The [spellchecker comparison](https://code.dblock.org/2026/10/29/one-tool-for-the-spell-checking-job.html), [Prettier plugin](https://github.com/dblock/prettier-plugin-spellcheck), and [Markdownlint rule](https://github.com/dblock/markdownlint-rule-spellcheck) inform offline dictionary configuration and reviewed vocabulary collection. This package integrates directly with its host and CSpell, not through either plugin. Their broad format support, corrections, metadata checking, and compatibility directives are not inherited automatically.

## Public API and Preparation

The planned ESM export `createPlugin(options)` is asynchronous. Consumers await it in flat configuration and register the returned plugin under `prose-spellcheck`. Dictionary preparation completes before ESLint calls the synchronous rule `create()`. The rule takes no options; different factory instances can serve different flat-config file selections.

Options are `dictionaries`, `baseDir`, and `words`. Omitted `dictionaries` selects packaged `@cspell/dict-en_us`; an explicit nonempty array replaces the default. Entries select installed CSpell dictionary packages or existing local `.txt` vocabulary. Include English explicitly to retain it when adding other languages. Dictionaries participate together without automatic locale selection or language detection. Software terms require explicit selection, not a separate boolean.

`baseDir` defaults to the working directory. Relative vocabulary paths and consumer-installed packages resolve from that directory; configuration can pass `import.meta.dirname` to make resolution independent of the invocation directory. Inline `words` defaults to an empty array. Local vocabulary is UTF-8 with one literal, case-sensitive word per line; blank lines and `#` comments are ignored. Phrases and CSpell dictionary control syntax are not vocabulary entries. Additional inflected forms must be listed explicitly.

Validate options and snapshot vocabulary during each factory call. Resolve only local package dictionary data and vocabulary; reject remote resources, arbitrary project configuration imports, missing files, invalid definitions, and dictionary-loading errors before returning a usable plugin. Use public CSpell dictionary and text-extraction APIs, never deprecated `validateText`, fake JavaScript ASTs, dependency mutation, or global CSpell configuration discovery.

Share immutable package-dictionary preparation promises by resolved resource identity, including concurrent requests, and remove failed preparations so a subsequent call can retry. Do not share project-specific vocabulary between plugin instances. A prepared plugin retains its vocabulary snapshot for its lifetime; recreate it to observe edits. No network access, background refresh, environment-dependent dictionaries, or silent fallback is allowed during spelling.

## Prose Selection and Locations

Use native mdast `root`, `text`, image, and relevant ancestor nodes exposed by `@eslint/markdown`; positions use `position.start.offset` and `position.end.offset`, not ESTree ranges. Check headings, paragraphs, emphasis, lists, quotes, tables, visible link labels, and image descriptions.

Exclude inline, fenced, and indented code; raw HTML and comments; link destinations, titles, and reference definitions; URLs and email addresses; and matched Liquid expressions and tags. Exclude only each URL, email, or template span, not surrounding prose. Never evaluate templates. Unmatched Liquid openers remain ordinary text. Recognized front matter is excluded, with the host configured using `languageOptions.frontmatter`; YAML string-value checking is deferred.

Try a whole candidate against the selected dictionaries and exact project vocabulary before splitting compound or camel-case terms with public CSpell text-extraction APIs. Preserve straight and curly apostrophes, Unicode letters, and combining marks. Do not discard a complete paragraph or identifier-like token solely because it contains a URL or a number. Specify the resulting splitting behavior with fixtures instead of relying on undocumented engine defaults.

Decode Markdown escapes and entities with an original-source mapping. Translate decoded word ranges back to original UTF-16 spans before calling `sourceCode.getLocFromIndex`. Preserve surrogate pairs, multiline positions, blockquote and list prefixes, CRLF, and missing final newlines. Entity spellings and Markdown syntax must not become spurious word candidates. Reports retain the visible unknown word while highlighting its complete original spelling.

Diagnostics are deterministic, report-only, and have no spelling fixes or suggestions. Honor native ESLint disable comments; directive-looking text inside code or Liquid must not suppress surrounding prose. The rule adds no heading or newline policy.

## Vocabulary Collection

The planned executable is `eslint-prose-spellcheck collect`, installed with this package. It uses the consumer's actual ESLint configuration and file selection, with positional files/globs and `--config` for explicit configuration. Only unsuppressed diagnostics from this spelling rule become candidates. Other lint errors, unreadable inputs, and an empty selected file set are errors.

Print sorted, deduplicated candidates preserving spelling to standard output, or create a new UTF-8 candidate file with `--output path`. Never overwrite an existing file, modify checked source, update ESLint configuration, enable disabled rules, or silently accept candidates. Users review the file and manually add it to `dictionaries`. Vocabulary refresh and automatic configuration editing are deferred. Implementation must test collection against the packed executable as well as the public rule.

## Dependencies and Runtime

Stable releases verified on 2026/11/08 are CSpell 10.4.1, the English dictionary 4.4.43, ESLint 10.14.0, `@eslint/markdown` 8.0.3, and Node.js 26.13.0. The runtime CSpell dependency requires Node.js 22.18.0; intersecting this with ESLint's supported engines gives `^22.18.0 || >=24.0.0`. Do not reuse the paragraph-wrap project's development-only CSpell assumptions or Node.js 22.13 minimum.

Direct runtime dependencies are pinned to make the baseline dictionary reproducible; consumers should retain their own lockfile for the entire dependency tree. `cspell-lib` includes a sizable bundled-dictionary dependency tree even though this plugin selects English by default. Dependency licenses remain separate from this package's MIT license.

ESLint and `@eslint/markdown` are peers, with the tested stable versions installed for development. Development tooling uses npm, ESM, `node --test`, c8, ESLint, Markdown preferences, ESLint YAML rules, and a small tested YAML display-name checker. No Markdownlint-family tooling is used. Documentation currently receives native structural, title-case, single-line paragraph, YAML, and embedded JavaScript checks; self-spellchecking is added with the implementation.

## Testing and Non-Goals

Data-driven files must test public exports and an installed tarball's actual ESLint CLI and collection executable. Cover valid prose, misspellings, vocabulary, contractions, compounds, headings, links, images, exclusions, suppression, emoji, escapes, entities, multiline containers, CRLF, missing final newline, configuration errors, dictionary-loading failures, and collection safety. Near-total line and branch coverage is the implementation goal, not evidence provided by an empty scaffold.

No JavaScript/TypeScript source spelling, plain-text language, standalone HTML, MDX, grammar checks, automatic corrections, suggestions, language detection, YAML value checking, vocabulary refresh, or automatic configuration editing is included in the first implementation.
