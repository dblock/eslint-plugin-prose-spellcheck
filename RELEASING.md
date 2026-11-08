# Releasing

Use **Actions > Release > Run workflow** on `master` only after explicit release authorization. A dispatch performs a real release; there is no dry-run input. Opening or merging the setup PR does not authorize dispatch or publication.

## Trusted Publishing

Version 0.1.0 was published manually and its registry integrity verified before this setup. No bootstrap or staging publication is needed. The GitHub Actions trusted publisher was configured and read back with npm 12.2.2 and browser 2FA on 2026/11/08:

| Setting | Verified Value |
| --- | --- |
| Organization or User | `dblock` |
| Repository | `eslint-plugin-prose-spellcheck` |
| Workflow Filename | `release.yml` |
| Environment | `release` |
| Direct Publishing | Enabled: `publish` permission, not stage-only |

Use npm 11.15.0 or later with a compatible Node version to inspect or configure the connection. Complete browser 2FA locally; never share codes or tokens:

```sh
npm trust list eslint-plugin-prose-spellcheck
```

If missing or expired, obtain authorization before recreating the connection:

```sh
npm trust github eslint-plugin-prose-spellcheck \
  --repo dblock/eslint-plugin-prose-spellcheck \
  --file release.yml --env release --allow-publish
```

A new publisher must complete its first successful publication within two days or expire. Verifying configuration does not prove actual OIDC publication. Verify the connection remains valid before an authorized dispatch; do not publish merely to prevent expiration.

The GitHub `release` environment is restricted to the `master` branch, with no required reviewers or allowed tag patterns. The repository-specific approved no-App exception removes only the PR requirement, allowing all writers to push directly. Force-push and deletion protections remain active without bypass actors; ordinary development still requires PRs. Repository writers can dispatch releases; adding required environment reviewers needs separate approval.

The GitHub-hosted Ubuntu workflow pins Node.js 26.13.0 and npm 12.2.2, grants `contents: write` and `id-token: write`, and uses the built-in `GITHUB_TOKEN` for Git and GitHub Releases. There is no stored npm token or `NODE_AUTH_TOKEN`. npm automatically supplies provenance for qualifying public packages and repositories. After the first trusted publication, inspect its provenance and consider tightening npm publishing-access settings only with separate authorization.

## Prepare and Dispatch

Keep `package.json`, `package-lock.json`, and `## <version> (Next)` synchronized, with meaningful linked release notes above the final placeholder. Verify registry release status before changing versions; keep unreleased versions unchanged. The workflow defaults to the checked-in version and prepares the next development patch afterward. README installation stays pinned to the published version.

Review the candidate and confirm separate Test, Lint, and Package CI results. Validate locally with the pinned development runtime:

```sh
npm ci
npm run test:coverage
npm run lint
npm run test:package
```

Only after explicit release authorization, dispatch from `master`:

```sh
gh workflow run release.yml --repo github.com/dblock/eslint-plugin-prose-spellcheck --ref master
```

An optional stable version overrides the checked-in version:

```sh
gh workflow run release.yml --repo github.com/dblock/eslint-plugin-prose-spellcheck --ref master -f version=0.1.1
```

Overrides cannot be older than the checked-in version or use prerelease syntax. Concurrent runs are serialized. The workflow never triggers on merges, pushes, or tags; local and non-dispatch release invocations are rejected.

## Automated Sequence

Actions checks out the exact dispatched commit. Hooks require a clean dependency installation, synchronized meaningful release notes, an unpublished npm version, and an absent tag. Release-it updates package versions; hooks date the Next section in UTC, remove the placeholder, and update the README installation pin before packing.

The hooks pack once to `.release/package.tgz`, retain its SHA-512 checksum and release metadata patch, then run lint, source tests, and the real packed-consumer suite. `PROSE_SPELLCHECK_PACKAGE_ARCHIVE` makes `npm run test:package` inspect and install that exact archive without repacking; it verifies name/version and all public spelling API, ESLint CLI, and collection fixtures with strict engines and peers. Normal package checks still pack into an owned temporary directory; an optional output destination retains the validated artifact without overwriting files.

Changes are limited to package version fields, CHANGELOG, and README. Immediately before publication, hooks reject changed metadata, a changed archive, or an advanced remote `master`. npm 11 and 12 pack/view JSON formats are supported and tested.

Release-it publishes the retained tarball through OIDC, then commits the metadata, creates an annotated version tag, and atomically pushes the matching commit/tag. Before creating the GitHub Release, hooks verify the remote branch/tag match the release commit and the registry version/integrity match the archive. The GitHub Release includes the archive and checksum.

After successful publication and GitHub Release creation, a second release-it run increments patch, adds the Next section and placeholder, validates source and packed consumers, and commits/pushes the next development metadata. README stays pinned to the released version. This second run does not publish, tag, or create another GitHub Release.

## Failure Recovery

Download the run's recovery artifacts before their 14-day retention expires. The validated archive, checksum, and release metadata patch remain available even if later steps fail. Do not blindly rerun: npm publication or a tag may already exist. Native destructive rollback is disabled; failed preparation is not reset.

Inspect remote refs, npm version/integrity, GitHub Release, and current `master` before selecting recovery:

```sh
git ls-remote origin refs/heads/master 'refs/tags/v<version>*'
npm view eslint-plugin-prose-spellcheck@<version> version dist.integrity dist.tarball --json
gh release view v<version> --repo github.com/dblock/eslint-plugin-prose-spellcheck
```

npm publication precedes the Git push. If publication succeeded but Git failed, reconstruct metadata from the exact dispatched source and retained patch, reconcile newer work without overwriting it, and finish missing commit/tag pushes only with explicit authorization. If publication failed, investigate authentication and use the original validated archive through an explicitly authorized workflow or interactive publication. Registry visibility can lag; verify it before treating a missing lookup as failure.

If only GitHub Release creation or next-version preparation failed, complete only those missing steps with authorization. Never overwrite published versions, force-push `master`, delete release tags, unpublish, or reset another writer's work. Clean up merged topic branches as described in [CONTRIBUTING.md](CONTRIBUTING.md).
