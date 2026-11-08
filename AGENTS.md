# Working on eslint-plugin-prose-spellcheck

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [DESIGN.md](DESIGN.md) before editing. This is currently a scaffold; spelling and vocabulary collection are not implemented. Do not describe the empty rule registry as working spellchecking.

## Implementation Invariants

Runtime code belongs in `src/`, tests in `test/`, and data-driven inputs and expected diagnostics in `test/fixtures/`. Development-only lint and package helpers belong in `scripts/`. Support Node.js `^22.18.0 || >=24.0.0`, native `@eslint/markdown`, and public CSpell APIs. Verify latest stable tooling when selecting or updating dependencies, preserving runtime compatibility.

Prepare dictionaries asynchronously before returning the plugin; keep ESLint rule creation synchronous. Keep dictionary loading offline and diagnostics deterministic. Preserve original UTF-16 source spans through emoji, decoded escapes/entities, multiline containers, and CRLF. Never fake ESTree nodes, mutate dependencies, use deprecated `validateText`, discover ambient CSpell settings, or suppress entire paragraphs containing URLs. Custom vocabulary is case-sensitive and instance-local. Collection must use real ESLint selection and suppression, require review, and never overwrite files or edit source/configuration.

Only implement approved first-version scope. Do not add spelling fixes, suggestions, YAML value checking, source-language spelling, automatic dictionary updates, or other deferred capabilities without approval. See DESIGN for selection and exclusion details.

## Validation and Documentation

Run `npm test` or `npm run test:coverage`, plus `npm run lint`, locally before every development push. Run `npm run test:package` before committing when packaging, dependencies, public entry points, or consumer configuration changes. Final results can serve the push only if tested content is unchanged. Focused tests use `node --test test/documentation.test.js` and `node --test test/workflow-names.test.js`; integration checks must install the actual packed artifact and invoke real ESLint and, once implemented, the collection executable.

Aim for coverage close to 100% of owned runtime lines and branches using meaningful behavior and error fixtures. `npm run test:coverage` includes subprocesses; explain remaining gaps without excluding real implementation. Maintain separate Test, Lint, and Package workflows, least-privilege permissions, explicit inline `matrix.entry` combinations without include/exclude, and Coveralls.

Use ESLint-family documentation linting, not Markdownlint. Keep Markdown paragraphs on one source line and human-readable headings and YAML workflow/job/step names in title case; preserve proper names, acronyms, expressions, and identifiers. `npm run lint` includes embedded JavaScript and the tested YAML-aware name checker. Once spelling is implemented, enable this plugin on its own documentation with reviewed `.spellcheck.txt` vocabulary, excluding intentional failures rather than broadly suppressing diagnostics.

## Versions and Changelog

Put version bumps in the same PR as the change. For features in `0.x`, increment minor and reset patch, such as `0.1.1` to `0.2.0`; for features in `1.x` and later, increment minor while preserving patch, such as `5.3.1` to `5.4.1`. Breaking changes are allowed in `0.x`: increment minor and reset patch without requesting a major bump. For breaking changes in `1.x` and later, ask before choosing a major bump. Document breaking behavior and migration guidance.

Keep package.json, package-lock.json, and the Next changelog version synchronized. Add entries for features, improvements, and fixes with verified PR links and contributor attribution, but not minor typos or the initial scaffold. Predict the number before opening the PR and correct it if necessary. Append entries chronologically above the final placeholder; keep release sections newest first.

## Git Safety

Use topic branches from `master` in the existing checkout, named `dblock/<topic>`. Worktrees are for parallel tasks only. Inspect status, branches, and worktrees before switching, and preserve unrelated changes. Most PRs should have one coherent commit. Squash merges are preferred; rebase merges are permitted, merge commits are not.

Task-owned topic history may be amended or squashed without additional authorization after verifying ownership and recording/reconciling the remote tip. Test and lint before pushing with `--force-with-lease` against that SHA; never plain force, rewrite others' work, or force-push `master`. Ordinary development changes require PRs, not direct default-branch commits or pushes. Include the Copilot co-author trailer and disclose AI authorship on behalf of `@dblock` in AI-authored PRs/comments. Use PR closing references instead of manually closing issues.

After merges, follow CONTRIBUTING's verified post-merge cleanup: fetch/prune, verify through GitHub, check dirty/untracked and dependent work, switch safely, then remove only clean unused worktrees and merged local branches. Never delete active PR work or `master`.

Do not merge, publish, create release tags/releases or artwork, set credentials, overwrite published versions/tags, or change release protections without explicit authorization. Release instructions in [RELEASING.md](RELEASING.md) remain provisional; no direct-push release automation is authorized.
