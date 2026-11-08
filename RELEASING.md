# Releasing

## Status

Releases are performed manually. There is no release workflow or configured trusted publisher. Publication, tags, and GitHub releases require explicit authorization; these instructions do not grant it.

## Preparation

Obtain explicit approval for the version and release procedure. Synchronize package.json, package-lock.json, and the changelog; replace the Next heading with `## <version> (YYYY/MM/DD)` and remove its placeholder when preparing an actual release. Follow the version policy in [AGENTS.md](AGENTS.md) and document breaking changes and migration instructions. Keep ordinary development and release preparation PR-based unless an exception is explicitly approved.

Use the committed dependency lockfile and run tests, lint, and package validation on the intended revision; verify CI when releasing a pushed revision. For 0.1.0:

```sh
npm run test:coverage
npm run lint
npm run test:package -- ./eslint-plugin-prose-spellcheck-0.1.0.tgz
```

The package check builds an archive, inspects its contents, and installs that exact archive in a fresh consumer to verify public API, native ESLint CLI behavior, and the collection executable. Its optional destination retains the validated archive only after all checks pass and refuses to overwrite an existing file. Without a destination, its temporary archive is removed. Do not rebuild a different artifact between approval and publication.

## Authentication and Publication

Only after explicit authorization, verify the npm account, ownership, package name acceptance, and version availability with `npm whoami`, `npm owner ls eslint-plugin-prose-spellcheck`, and `npm view eslint-plugin-prose-spellcheck versions --json`. Registry E404 is not a reservation or a publication guarantee. Do not provision credentials, trusted publishing, environments, or additional automation without approval.

Publish the retained archive, not the working directory:

```sh
npm publish ./eslint-plugin-prose-spellcheck-0.1.0.tgz --access public
```

Publishing, tagging, and creating a GitHub release each require authorization; do not overwrite an existing published version or tag.

## Verification

After an authorized publication, verify registry version and integrity with `npm view eslint-plugin-prose-spellcheck@<version> version dist.integrity dist.tarball --json`, install that registry version in a fresh consumer, and rerun the real behavior fixtures. Verify that an approved release tag points to the reviewed commit and matches the package and dated changelog. Do not claim success from the publish command alone.

Add the next development version and Next changelog section in a subsequent PR unless release automation has been explicitly authorized. Clean up merged local branches as described in [CONTRIBUTING.md](CONTRIBUTING.md).
