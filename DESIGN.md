# Design

## Status and Purpose

The unreleased implementation provides an asynchronously prepared plugin and a vocabulary collection executable. No publication, merge, or release tag is authorized by these instructions.

Provide one native ESLint Markdown rule, `prose-spellcheck/spellchecker`, and a read-only vocabulary collection command. Use ESLint's file selection, configuration, severity, ignore rules, suppression comments, and diagnostic formats rather than introducing another documentation linter.

## Prior Art

The motivating [paragraph-wrap PR #4](https://github.com/dblock/eslint-plugin-markdown-preferences-paragraph-wrap/pull/4) established that `@cspell/eslint-plugin` listens for JavaScript `Program` nodes and misses native Markdown prose. Its local documentation plugin uses public CSpell APIs, but raw-text checking does not establish correct decoded entity locations or exclusion of URLs inside paragraphs. Its first-heading and final-newline rules are unrelated and are not carried over.

The [spellchecker comparison](https://code.dblock.org/2026/10/29/one-tool-for-the-spell-checking-job.html), [Prettier plugin](https://github.com/dblock/prettier-plugin-spellcheck), and [Markdownlint rule](https://github.com/dblock/markdownlint-rule-spellcheck) inform offline dictionary configuration and reviewed vocabulary collection. This package integrates directly with its host and CSpell, not through either plugin. Their broad format support, corrections, metadata checking, and compatibility directives are not inherited automatically.

## Public API and Preparation

The ESM named and default export `createPlugin(options)` is asynchronous. Consumers await it in flat configuration and register the returned plugin under `prose-spellcheck`. Dictionary preparation completes before ESLint calls the synchronous rule `create()`. The rule takes no options; different factory instances can serve different flat-config file selections. Importing the package does not prepare this plugin's dictionaries.

Options are `dictionaries`, `baseDir`, and `words`. Omitted `dictionaries` selects packaged `@cspell/dict-en_us`; an explicit nonempty array replaces the default. Entries select installed CSpell dictionary packages or existing local `.txt` vocabulary. Include English explicitly to retain it when adding other languages. Dictionaries participate together without automatic locale selection or language detection. Software terms require explicit selection, not a separate boolean.

`baseDir` defaults to the working directory. Relative vocabulary paths and consumer-installed packages resolve from that directory; configuration can pass `import.meta.dirname` to make resolution independent of the invocation directory. File-URL strings ending in `.txt` are accepted too. Default English resolves from this package's pinned runtime dependency; explicit English selects a consumer-installed version when available, otherwise the bundled one. Inline `words` defaults to an empty array. Local vocabulary is UTF-8 with one literal, case-sensitive word per line; blank lines and `#` comments are ignored. Phrases and CSpell dictionary control syntax are not vocabulary entries. Straight and curly apostrophes are equivalent without changing case. Additional inflected forms must be listed explicitly.

Validate options and snapshot vocabulary during each factory call. Resolve only local package dictionary data and vocabulary; reject remote resources, missing files, invalid definitions, and dictionary-loading errors before returning a usable plugin. Packages must export JSON containing direct `dictionaryDefinitions`; load the definitions named by a nonempty exported `dictionaries` list, or all direct definitions when that list is empty/absent. Suggestion-only definitions and configuration imports are not loaded. A package consisting only of imports is not dictionary data. Never execute dictionary exports or discover arbitrary project configuration. Use public CSpell `getDictionary`, `getErrors`, `has`, and `Text` extraction APIs, never deprecated `validateText`, fake JavaScript ASTs, dependency mutation, or global CSpell configuration discovery.

Share immutable package-dictionary preparation promises by resolved resource identity, including concurrent requests, and remove failed preparations so a subsequent call can retry. Each new package preparation uses distinct public dictionary-definition names so CSpell's own failed-file cache does not prevent retry, without clearing or mutating dependency caches. Do not share project-specific vocabulary between plugin instances. A prepared plugin retains its vocabulary snapshot for its lifetime; recreate it to observe edits. Installed package dictionary data is immutable for the process lifetime. No network access, background refresh, environment-dependent dictionaries, or silent fallback is allowed during spelling.

## Prose Selection and Locations

Use the native mdast `root` exposed by `@eslint/markdown`; positions use `position.start.offset` and `position.end.offset`, not ESTree ranges. Check headings, paragraphs, emphasis, lists, quotes, tables, visible link labels, and image descriptions. Concatenate inline prose within each block so formatting inside a word does not create false spelling fragments. Excluded code/HTML nodes and image boundaries separate words. Native images have flattened labels without text children; parse their original labels with public Markdown utilities, retaining inline context, original-source bases, and the real image node for reporting. Compare the native description with a CommonMark parse to retain the host's interpretation of GFM formatting. Serialize original reference definitions into the context used to parse labels so reference identifiers and destinations are not mistaken for description text.

Exclude inline, fenced, and indented code; raw HTML and comments; link destinations, titles, and reference definitions; URLs and email addresses; and matched Liquid expressions and tags. Exclude only each URL, email, or template span, not surrounding prose. Never evaluate templates. Unmatched Liquid openers remain ordinary text. Recognized front matter is excluded, with the host configured using `languageOptions.frontmatter`; YAML string-value checking is deferred.

Try a whole candidate, after trimming surrounding punctuation, against the selected dictionaries and exact project vocabulary before splitting compound or camel-case terms with public CSpell text-extraction APIs. Preserve straight and curly apostrophes, Unicode letters, and combining marks. Hyphens, underscores, digits, and case/acronym boundaries can separate components; known whole vocabulary is checked first. Do not discard a complete paragraph or identifier-like token solely because it contains a URL or a number. Fixtures define the tested behavior.

Decode Markdown escapes and entities with public `micromark-util-decode-string` and an original-source mapping. Translate decoded word ranges back to original UTF-16 spans before calling `sourceCode.getLocFromIndex`. Preserve surrogate pairs, multiline positions, blockquote and list prefixes, CRLF, and missing final newlines. Entity spellings and Markdown syntax must not become spurious word candidates. Reports retain the visible unknown word while highlighting its original spelling, including encoded characters and intervening emphasis delimiters.

Diagnostics are deterministic, report-only, and have no spelling fixes or suggestions. Honor native ESLint disable comments; directive-looking text inside code is isolated by the host. Native `@eslint/markdown` does interpret directive comments inside Liquid as ESLint configuration, even though Liquid contents are excluded from spelling. This verified host limitation is intentionally retained: the spelling rule does not alter the language, AST, or suppression machinery. The rule adds no heading or newline policy.

## Vocabulary Collection

The executable is `eslint-prose-spellcheck collect`, installed with this package. It uses the consumer's actual ESLint configuration and file selection, with positional files/globs and `--config` for explicit configuration. Only unsuppressed diagnostics from this spelling rule become candidates, including warning-severity findings and custom plugin namespaces identified through plugin metadata. Other lint errors, unreadable inputs, unmatched patterns, and selection without an enabled spelling rule are errors.

Print sorted, deduplicated candidates preserving spelling to standard output, or create a new UTF-8 candidate file with `--output path` using exclusive creation. No candidate output is written until the entire scan succeeds. Never overwrite an existing file, modify checked source, update ESLint configuration, enable disabled rules, or silently accept candidates. Users review the file and manually add it to `dictionaries`. Vocabulary refresh and automatic configuration editing are deferred. The same collection fixtures run against the source executable and the installed packed executable.

## Dependencies and Runtime

Stable releases verified on 2026/11/08 are CSpell 10.4.1, the English dictionary 4.4.43, ESLint 10.14.0, `@eslint/markdown` 8.0.3, and Node.js 26.13.0. The runtime CSpell dependency requires Node.js 22.18.0; intersecting this with ESLint's supported engines gives `^22.18.0 || >=24.0.0`. Do not reuse the paragraph-wrap project's development-only CSpell assumptions or Node.js 22.13 minimum.

Direct runtime dependencies are pinned to make the baseline dictionary reproducible; consumers should retain their own lockfile for the entire dependency tree. `cspell-lib` includes a sizable bundled-dictionary dependency tree even though this plugin selects English by default. Dependency licenses remain separate from this package's MIT license.

ESLint and `@eslint/markdown` are peers, with the tested stable versions installed for development. Public Markdown utilities are `mdast-util-from-markdown` 2.1.0, `mdast-util-gfm` 3.1.0, `mdast-util-to-markdown` 2.2.3, `micromark-extension-gfm` 3.0.0, and `micromark-util-decode-string` 2.0.1. Spanish 3.0.9 and software terms 5.4.9 are development-only dictionaries for fixtures and documentation, not default runtime languages. Development tooling uses npm, ESM, `node --test`, c8, ESLint, Markdown preferences, ESLint YAML rules, and a small tested YAML display-name checker. No Markdownlint-family tooling is used. Documentation receives native structural, title-case, single-line paragraph, YAML, embedded JavaScript, and this package's own spelling checks with reviewed `.spellcheck.txt` vocabulary.

## Testing and Non-Goals

Data-driven files test public exports and the actual ESLint CLI and collection executable from an installed tarball. Cover valid prose, misspellings, vocabulary, contractions, compounds, headings, links, images, exclusions, suppression, emoji, escapes, entities, multiline containers, CRLF, missing final newline, configuration errors, dictionary-loading failures, and collection safety. Synthetic dictionary packages are created only in owned temporary consumers; installed CSpell dependencies are never patched. Near-total line and branch coverage is the goal, with uncovered paths explained rather than hidden.

No JavaScript/TypeScript source spelling, plain-text language, standalone HTML, MDX, grammar checks, automatic corrections, suggestions, language detection, YAML value checking, vocabulary refresh, or automatic configuration editing is included in the first implementation.

## Artwork

The approved Dictionary Finch concept uses a natural pen-and-ink-style finch perched on an open dictionary, with a pencil resting on the pages. Recognizable feather structure, natural proportions, and an attentive pose replace the geometric mascot. The original illustration was generated using the GitHub Copilot image tool on behalf of @dblock and is covered by this project's MIT license. No reference images or copied artwork were supplied.

`assets/logo-source.png` preserves the original generated image with transparency. `assets/logo.png` is the display asset, composed onto white so the ink stays readable on both light and dark pages. These are raster images, not editable vector paths. Preserve the original source when editing or regenerating. Keep the logo first in README at a display width of 160 pixels, with descriptive alternative text and blank lines before the project title and badges.

Generation brief: create an original black-and-white pen-and-ink finch illustration, with authentic anatomy, layered wing and tail feathers, a short closed conical beak, slender gripping feet, and a small attentive eye. Perch the bird naturally on an open dictionary with a pencil resting diagonally on the pages. Use restrained hatching, confident contours, generous margins, and no readable lettering. Keep the silhouette recognizable at 160 pixels. Avoid human-like arms, eyebrows, smiles, oversized eyes, geometric badges, gradients, and colored backgrounds.

After editing, inspect the full-size artwork and README rendering at 160 pixels on light and dark backgrounds for legibility and clipping. Use `magick` to regenerate the display asset from the retained source and produce optional review previews:

```sh
magick assets/logo-source.png -background white -alpha remove -alpha off -strip assets/logo.png
magick assets/logo.png -resize 640x640 /tmp/prose-spellcheck-logo-full.png
magick assets/logo.png -resize 160x160 /tmp/prose-spellcheck-logo-small.png
```

Run `npm run lint` and `npm run test:package` after artwork or README changes. Package validation verifies that the actual archive contains both PNG files alongside the README that references the display asset.
