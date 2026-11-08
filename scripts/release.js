import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const archivePath = ".release/package.tgz";
const metadataPaths = ["CHANGELOG.md", "README.md", "package-lock.json", "package.json"];
const trailer = "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>";
const command = (program, args, options = {}) => execFileSync(program, args, { encoding: "utf8", ...options });
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (bytes, encoding = "hex") => createHash("sha512").update(bytes).digest(encoding);

export function stableVersion(version) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    "Use a stable version without a prefix or shell syntax.");
  assert.ok(version.split(".").every((part) => Number.isSafeInteger(Number(part))),
    "Version components must be safe integers.");
  return version;
}

export function nextVersion(version) {
  const [major, minor, patch] = stableVersion(version).split(".").map(Number);
  return stableVersion(`${major}.${minor}.${patch + 1}`);
}

function nextSection(text) {
  const matches = [...text.matchAll(/^## (\d+\.\d+\.\d+) \(Next\)$/gmu)];
  assert.equal(matches.length, 1, "Require exactly one Next changelog section.");
  const match = matches[0];
  const following = text.indexOf("\n## ", match.index + match[0].length);
  const end = following === -1 ? text.length : following;
  const notes = text.slice(match.index + match[0].length, end).replace(/^- Your contribution here\.\n?/gmu, "").trim();
  assert.match(notes, /^-\s+\S/mu, "Require meaningful release notes, not only the placeholder.");
  return { version: match[1], index: match.index, end, notes };
}

export function releaseChangelog(text, current, version, date) {
  stableVersion(version);
  const section = nextSection(text);
  assert.equal(section.version, current, "The Next heading must match the checked-in version.");
  return {
    text: `${text.slice(0, section.index)}## ${version} (${date})\n\n${section.notes}\n${text.slice(section.end)}`,
    notes: section.notes,
  };
}

export function developmentChangelog(text, version) {
  assert.ok(!/^## .+ \(Next\)$/mu.test(text), "Do not duplicate a Next section.");
  const index = text.indexOf("\n## ");
  assert.ok(index >= 0, "Require a released changelog section.");
  return `${text.slice(0, index)}\n## ${stableVersion(version)} (Next)\n\n- Your contribution here.\n${text.slice(index)}`;
}

export function validateMetadata(original, current, version) {
  const expected = JSON.parse(JSON.stringify(original));
  expected.version = version;
  if (expected.packages) expected.packages[""].version = version;
  assert.deepEqual(current, expected, "Only release versions may change in package metadata.");
}

export function npmRecord(output) {
  const parsed = JSON.parse(output);
  assert.ok(parsed && typeof parsed === "object", "Require npm JSON records.");
  const records = Array.isArray(parsed) ? parsed : parsed.version ? [parsed] : Object.values(parsed);
  assert.equal(records.length, 1, "Require exactly one npm result.");
  assert.ok(records[0] && typeof records[0] === "object" && !Array.isArray(records[0]), "Require an npm record.");
  return records[0];
}

export function registryVersion(name, version, execute = command) {
  try {
    return npmRecord(execute("npm", [
      "view", `${name}@${version}`, "version", "dist.integrity", "--json", "--registry", "https://registry.npmjs.org",
    ]));
  } catch (error) {
    let code;
    try {
      code = JSON.parse(String(error.stdout)).error?.code;
    } catch {
      throw error;
    }
    if (code === "E404") return null;
    throw error;
  }
}

export async function releaseStep(step, version, { execute = command } = {}) {
  const git = (...args) => execute("git", args).trim();
  const manifest = await json("package.json");
  const changelog = await readFile("CHANGELOG.md", "utf8");
  if (step === "notes") return process.stdout.write(`${nextSection(changelog).notes}\n`);
  if (step === "clean" || step === "check") {
    assert.equal(git("status", "--porcelain"), "", "Require a clean checkout after dependency installation.");
    if (step === "clean") return;
    version = stableVersion(process.env.RELEASE_VERSION || manifest.version);
    const difference = version.split(".").map((part, i) => Number(part) - Number(manifest.version.split(".")[i]))
      .find((part) => part !== 0) ?? 0;
    assert.ok(difference >= 0, "Do not release a version older than the checked-in version.");
    releaseChangelog(changelog, manifest.version, version, "");
    assert.equal(git("ls-remote", "origin", `refs/tags/v${version}`), "", "The release tag already exists.");
    assert.equal(registryVersion(manifest.name, version, execute), null, "The npm version already exists.");
    await mkdir(".release");
    return;
  }
  stableVersion(version);
  if (step === "prepare" || step === "development") {
    const original = JSON.parse(git("show", "HEAD:package.json"));
    const text = step === "prepare"
      ? releaseChangelog(changelog, original.version, version, new Date().toISOString().slice(0, 10).replaceAll("-", "/")).text
      : developmentChangelog(changelog, version);
    await writeFile("CHANGELOG.md", text);
    if (step === "prepare") {
      const readme = await readFile("README.md", "utf8");
      const install = /^(npm install --save-dev eslint @eslint\/markdown eslint-plugin-prose-spellcheck@)\d+\.\d+\.\d+$/gmu;
      assert.equal([...readme.matchAll(install)].length, 1, "Require one versioned README installation command.");
      await writeFile("README.md", readme.replace(install, `$1${version}`));
      const archive = npmRecord(execute("npm", ["pack", "--json", "--pack-destination", ".release"]));
      assert.match(archive.filename, /^[A-Za-z0-9._-]+\.tgz$/u);
      await rename(resolve(".release", archive.filename), archivePath);
      await writeFile(`${archivePath}.sha512`, `${hash(await readFile(archivePath))}  package.tgz\n`);
      await writeFile(".release/metadata.patch", execute("git", ["diff", "--binary", "HEAD"]));
    }
    execute("npm", ["run", "lint"], { stdio: "inherit" });
    execute("npm", ["test"], { stdio: "inherit" });
    execute("npm", ["run", "test:package"], {
      stdio: "inherit", env: { ...process.env, PROSE_SPELLCHECK_PACKAGE_ARCHIVE: step === "prepare" ? resolve(archivePath) : "" },
    });
    for (const entry of execute("git", ["status", "--porcelain", "-z"]).split("\0").filter(Boolean)) {
      assert.ok(/^ ?M /u.test(entry) && metadataPaths.includes(entry.slice(3)), `Unexpected release change: ${entry}`);
    }
    for (const path of ["package.json", "package-lock.json"]) {
      validateMetadata(JSON.parse(git("show", `HEAD:${path}`)), await json(path), version);
    }
    return;
  }
  if (step === "ready") {
    assert.equal(git("ls-remote", "origin", "refs/heads/master").split(/\s/u)[0], git("rev-parse", "HEAD"),
      "Master advanced; dispatch a new run.");
    assert.equal(execute("git", ["diff", "--binary", "HEAD"]), await readFile(".release/metadata.patch", "utf8"),
      "The validated release metadata changed.");
    assert.equal(hash(await readFile(archivePath)), (await readFile(`${archivePath}.sha512`, "utf8")).split(" ")[0],
      "The validated archive changed.");
    return;
  }
  if (step === "verify") {
    const head = git("rev-parse", "HEAD");
    const refs = git("ls-remote", "origin", "refs/heads/master", `refs/tags/v${version}^{}`).split("\n");
    assert.ok(refs.includes(`${head}\trefs/heads/master`) && refs.includes(`${head}\trefs/tags/v${version}^{}`),
      "The release commit and tag were not pushed; recover before creating a GitHub Release.");
    const published = registryVersion(manifest.name, version, execute);
    assert.equal(published?.version, version, "Verify registry visibility before recovery.");
    assert.equal(published["dist.integrity"], `sha512-${hash(await readFile(archivePath), "base64")}`,
      "The registry artifact must match the validated archive.");
    return;
  }
  assert.equal(step, "next", "Unknown release step.");
  const options = await json(".release-it.json");
  const { default: release } = await import("release-it");
  await release({
    ...options, config: false, ci: true, increment: nextVersion(version),
    git: { ...options.git, changelog: false, tag: false, pushArgs: ["--atomic", "--no-follow-tags"],
      commitMessage: `Prepare \${version} development\n\n${trailer}` },
    npm: { ...options.npm, publish: false }, github: false,
    hooks: { "before:init": "node scripts/release.js clean", "after:bump": "node scripts/release.js development ${version}" },
  });
}

if (import.meta.main) {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Use Actions > Release > Run workflow.");
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch", "Require manual release dispatch.");
  assert.equal(process.env.GITHUB_REF, "refs/heads/master", "Release only from master.");
  if (process.argv[2]) await releaseStep(process.argv[2], process.argv[3]);
  else {
    process.env.RELEASE_VERSION = stableVersion(process.env.RELEASE_VERSION || (await json("package.json")).version);
    const { default: release } = await import("release-it");
    await release({ ci: true, increment: process.env.RELEASE_VERSION });
  }
}
