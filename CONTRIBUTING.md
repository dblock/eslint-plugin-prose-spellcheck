# Contributing

## Setup and Validation

Use Node.js `^22.18.0 || >=24.0.0`; Node.js 26.13.0 is the current development and CI baseline. Install the committed lockfile with `npm ci`. When selecting or updating dependencies and Actions, verify the latest stable releases while preserving supported-runtime compatibility.

```sh
npm ci
npm test
npm run test:coverage
npm run lint
npm run test:package
```

Run `npm test` or `npm run test:coverage` and `npm run lint` locally before every development push, including PR updates. Run `npm run test:package` before committing when packaging, dependencies, entry points, or consumer configuration changes; the initial scaffold requires it too. Perform final checks before committing and reuse results for the push only when the tested files and configuration are unchanged. Do not push failed or unverified changes.

`npm run lint` checks JavaScript, native Markdown, embedded JavaScript fences, YAML syntax, and workflow display-name capitalization using the ESLint family and the focused YAML-aware checker. Keep every Markdown paragraph on one source line and use title case for human-readable headings and workflow, job, and step names. Preserve proper names, acronyms, expressions, and machine identifiers. Documentation spelling is not implemented in the scaffold.

## Tests

Tests use `node --test`. Documentation and workflow checks use data-driven files in `test/fixtures/`; intentional failures are excluded from repository linting. Run a focused file with `node --test test/documentation.test.js` or `node --test test/workflow-names.test.js`.

`npm run test:package` creates a real npm tarball, inspects its archive, installs it into an owned temporary consumer, and compares public ESLint API and actual ESLint CLI diagnostics with file fixtures. It cleans up only its own temporary directory. The scaffold verifies importability and host integration, not spelling. Extend this harness to all agreed behavior and the collection executable during implementation.

`npm run test:coverage` includes child-process coverage and reports lines and branches. Aim close to 100% of project-owned runtime code with meaningful cases, especially configuration errors, loading failures, Unicode locations, and collection safety. Do not hide implementation code or add trivial assertions to raise percentages; report real gaps. Keep the Test, Lint, and Package workflows separate, use explicit inline `matrix.entry` combinations without include/exclude, and maintain Coveralls reporting.

## Pull Requests

Read [DESIGN.md](DESIGN.md). Work branch-first in the existing checkout: inspect status, branches, and worktrees, then use `git switch -c dblock/<topic> master` for independent work. Use a worktree only for parallel tasks. Preserve unrelated changes; do not switch an occupied checkout or discard work. Dependent PRs branch from and target their prerequisite until it merges.

Prefer one coherent commit per PR; useful independently reviewable commits are acceptable. Merge with squash, not a merge commit; repository settings also permit rebase merges. No direct development commits or pushes to `master`, no force-push to `master`, and no merging, publication, release tags, artwork, or credential setup without explicit authorization.

Task-owned topic commits may be amended or squashed without additional approval. Verify ownership and record the remote tip first, reconcile remote changes, run local tests and lint, and push using `--force-with-lease` against that recorded SHA. Never use plain force or rewrite another contributor's or task's work.

Update affected documentation and add linked changelog entries for features, improvements, and fixes, but not minor typos or the initial scaffold. Predict the next shared issue/PR number before opening a PR, then verify and correct it immediately. Append entries oldest first above the Next placeholder using `- [#123](https://github.com/dblock/eslint-plugin-prose-spellcheck/pull/123): Description - [@author](https://github.com/author).` Put version bumps in the same PR and follow [AGENTS.md](AGENTS.md)'s version policy. See [RELEASING.md](RELEASING.md) for provisional release instructions.

Include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` in AI-assisted commits. AI-authored PRs and comments must disclose AI authorship on behalf of `@dblock`. Use closing issue references in implementation PRs, leaving issues open until merge.

After a merge, fetch with pruning, verify the merged state through GitHub, inspect for dirty or untracked work and dependent PRs, and safely switch to `master`. Remove only clean, no-longer-needed parallel worktrees and delete their local merged topic branches. Use `git branch -D` only after verifying that a squash/rebase merge and absence of dependent work make deletion safe. Never delete `master`, active PR branches, or dirty worktrees; report blocked cleanup.
