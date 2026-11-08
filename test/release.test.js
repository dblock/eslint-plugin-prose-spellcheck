import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  developmentChangelog, nextVersion, npmRecord, registryVersion, releaseChangelog, releaseStep, stableVersion, validateMetadata,
  waitForRegistryVersion,
} from "../scripts/release.js";

const cases = JSON.parse(await readFile(new URL("./fixtures/release/changelog.json", import.meta.url), "utf8"));
for (const fixture of cases) {
  test(`release changelog: ${fixture.name}`, () => {
    const release = () => releaseChangelog(fixture.input, fixture.current, fixture.version, "2026/11/08");
    if (fixture.error) {
      assert.throws(release, new RegExp(fixture.error, "u"));
    } else {
      const result = release();
      assert.equal(result.text, fixture.expected);
      assert.equal(developmentChangelog(result.text, nextVersion(fixture.version)), fixture.next);
      assert.throws(() => developmentChangelog(fixture.input, "0.3.0"), /duplicate/u);
    }
  });
}

test("registry verification tolerates delayed publication with fresh, spaced lookups", async () => {
  const missing = Object.assign(new Error("missing"), { stdout: '{"error":{"code":"E404"}}' });
  const published = { version: "0.1.2", "dist.integrity": "sha512-example" };
  let lookups = 0;
  const waits = [];
  const result = await waitForRegistryVersion("example", "0.1.2", {
    execute: (program, args) => {
      assert.equal(program, "npm");
      assert.ok(args.includes("--prefer-online"));
      if (++lookups < 3) throw missing;
      return JSON.stringify([published]);
    },
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.deepEqual(result, published);
  assert.equal(lookups, 3);
  assert.equal(waits.length, 2);
  assert.ok(waits.every((milliseconds) => milliseconds > 0));
});

test("registry visibility timeout is nonfatal and other lookup errors are not retried", async () => {
  let lookups = 0;
  assert.equal(await waitForRegistryVersion("example", "0.1.2", {
    execute: () => {
      assert.ok(++lookups < 100, "Do not retry indefinitely.");
      throw Object.assign(new Error("missing"), { stdout: '{"error":{"code":"E404"}}' });
    },
    wait: async () => {},
  }), null);
  assert.ok(lookups > 1);
  for (const stdout of ['{"error":{"code":"E401"}}', '{"error":{"code":"E500"}}', "network failure"]) {
    lookups = 0;
    await assert.rejects(waitForRegistryVersion("example", "0.1.2", {
      execute: () => {
        lookups++;
        throw Object.assign(new Error("failed"), { stdout });
      },
      wait: async () => { assert.fail("Do not wait on authentication or network errors."); },
    }), /failed/u);
    assert.equal(lookups, 1);
  }
});

test("final registry verification records timeout warnings and checks the released version after development advances", async () => {
  const bytes = "validated archive";
  const published = {
    version: "0.1.1", "dist.integrity": `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
  for (const fixture of [
    { record: null, message: /could not be verified.*do not republish/u, summary: true },
    { record: published, message: /Verified npm release 0\.1\.1/u },
    { record: { ...published, version: "0.1.2" }, error: /published version/u },
    { record: { ...published, "dist.integrity": "sha512-wrong" }, error: /artifact must match/u },
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "prose-registry-verification-"));
    const cwd = process.cwd();
    const summary = process.env.GITHUB_STEP_SUMMARY;
    try {
      process.chdir(directory);
      await mkdir(".release");
      await writeFile("package.json", '{"name":"example","version":"0.1.2"}');
      await writeFile("CHANGELOG.md", cases[0].input);
      await writeFile(".release/package.tgz", bytes);
      if (fixture.summary) {
        process.env.GITHUB_STEP_SUMMARY = join(directory, "summary.md");
        await writeFile("summary.md", "Previous step summary.\n");
      } else {
        delete process.env.GITHUB_STEP_SUMMARY;
      }
      const verify = () => releaseStep("verify", "0.1.1", {
        execute: (program) => {
          assert.equal(program, "npm", "Registry confirmation must not compare the next commit to the release tag.");
          if (fixture.record === null) {
            throw Object.assign(new Error("missing"), { stdout: '{"error":{"code":"E404"}}' });
          }
          return JSON.stringify([fixture.record]);
        },
        wait: async () => {},
      });
      if (fixture.error) {
        await assert.rejects(verify(), fixture.error);
        await assert.rejects(readFile(".release/verification.txt"), { code: "ENOENT" });
      } else {
        await verify();
        assert.match(await readFile(".release/verification.txt", "utf8"), fixture.message);
        if (fixture.summary) {
          const text = await readFile("summary.md", "utf8");
          assert.ok(text.startsWith("Previous step summary.\n"));
          assert.match(text, fixture.message);
        }
      }
    } finally {
      if (summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = summary;
      process.chdir(cwd);
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("release versions reject shell syntax, unsupported versions, and overflow", () => {
  for (const version of ["v1.0.0", "1.0.0-beta.1", "01.0.0", "1.0.0; echo bad", "1.0.9007199254740992"]) {
    assert.throws(() => stableVersion(version));
  }
  assert.equal(nextVersion("1.2.9"), "1.2.10");
  assert.throws(() => nextVersion("1.0.9007199254740991"));
});

test("package versions cannot hide dependency or lockfile changes", () => {
  const original = { version: "0.1.1", dependencies: { example: "1.0.0" } };
  validateMetadata(original, { ...original, version: "0.2.0" }, "0.2.0");
  assert.throws(() => validateMetadata(original,
    { version: "0.2.0", dependencies: { example: "2.0.0" } }, "0.2.0"), /Only release versions/u);
  const lock = { version: "0.1.1", packages: { "": { version: "0.1.1" }, example: { version: "1.0.0" } } };
  const updated = JSON.parse(JSON.stringify(lock));
  updated.version = updated.packages[""].version = "0.2.0";
  validateMetadata(lock, updated, "0.2.0");
  updated.packages.example.version = "2.0.0";
  assert.throws(() => validateMetadata(lock, updated, "0.2.0"));
});

test("npm 11 and 12 pack/view JSON produce exactly one record", () => {
  const packed = { filename: "example-0.1.1.tgz", version: "0.1.1" };
  for (const shape of [[packed], { example: packed }]) {
    assert.deepEqual(npmRecord(JSON.stringify(shape)), packed);
  }
  const published = { version: "0.1.1", "dist.integrity": "sha512-example" };
  for (const shape of [published, [published]]) {
    assert.deepEqual(registryVersion("example", "0.1.1", () => JSON.stringify(shape)), published);
  }
  for (const shape of [null, [], [packed, packed], ["not a record"]]) {
    assert.throws(() => npmRecord(JSON.stringify(shape)));
  }
  const missing = Object.assign(new Error("missing"), { stdout: '{"error":{"code":"E404"}}' });
  assert.equal(registryVersion("example", "0.1.1", () => { throw missing; }), null);
  for (const stdout of ['{"error":{"code":"E401"}}', "network failure"]) {
    const error = Object.assign(new Error("failed"), { stdout });
    assert.throws(() => registryVersion("example", "0.1.1", () => { throw error; }), /failed/u);
  }
});

test("release CLI rejects local, automatic, and non-master runs before loading release-it", () => {
  for (const [environment, message] of [
    [{ GITHUB_ACTIONS: "" }, /Use Actions/u],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" }, /manual release dispatch/u],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/topic" }, /only from master/u],
  ]) {
    assert.throws(() => execFileSync(process.execPath, [
      fileURLToPath(new URL("../scripts/release.js", import.meta.url)),
    ], { encoding: "utf8", stdio: "pipe", env: { ...process.env, ...environment } }), message);
  }
});

test("publication rejects an advanced branch or changed metadata/archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prose-release-ready-"));
  const cwd = process.cwd();
  const head = "a".repeat(40);
  let remote = head;
  let patch = "validated metadata";
  const execute = (program, args) => {
    assert.equal(program, "git");
    if (args[0] === "ls-remote") return `${remote}\trefs/heads/master`;
    if (args[0] === "rev-parse") return head;
    assert.deepEqual(args, ["diff", "--binary", "HEAD"]);
    return patch;
  };
  try {
    process.chdir(directory);
    await mkdir(".release");
    await writeFile("package.json", '{"version":"0.1.1"}');
    await writeFile("CHANGELOG.md", cases[0].input);
    await writeFile(".release/metadata.patch", patch);
    await writeFile(".release/package.tgz", "validated archive");
    await writeFile(".release/package.tgz.sha512",
      `${createHash("sha512").update("validated archive").digest("hex")}  package.tgz\n`);
    await releaseStep("ready", "0.1.1", { execute });
    remote = "b".repeat(40);
    await assert.rejects(releaseStep("ready", "0.1.1", { execute }), /Master advanced/u);
    remote = head;
    patch = "changed metadata";
    await assert.rejects(releaseStep("ready", "0.1.1", { execute }), /metadata changed/u);
    patch = "validated metadata";
    await writeFile(".release/package.tgz", "changed archive");
    await assert.rejects(releaseStep("ready", "0.1.1", { execute }), /archive changed/u);
  } finally {
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});

const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supportsRelease = major >= 26 || (major === 24 && minor >= 15) ||
  (major === 22 && (minor > 22 || (minor === 22 && patch >= 2)));

for (const mode of ["checked-in version", "version override"]) {
  test(`native release-it flow: ${mode}`, { skip: !supportsRelease || process.platform === "win32" }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "prose-release-"));
    const root = join(directory, "source");
    const remote = join(directory, "remote.git");
    await mkdir(root);
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
    try {
      git("init", "--bare", remote);
      git("init", "-b", "master");
      git("config", "user.name", "Release Test");
      git("config", "user.email", "release@example.invalid");
      git("remote", "add", "origin", remote);
      await writeFile(join(root, ".gitignore"), ".release/\nbin/\n");
      const manifest = {
        name: "release-fixture", version: "0.1.1", type: "module",
        repository: { type: "git", url: "git+https://github.com/example/release-fixture.git" },
      };
      const released = mode === "checked-in version" ? manifest.version : "0.2.0";
      const readme = "# Release Fixture\n\nnpm install --save-dev eslint @eslint/markdown eslint-plugin-prose-spellcheck@0.1.0\n";
      await writeFile(join(root, "README.md"), readme);
      await writeFile(join(root, "package.json"), JSON.stringify(manifest));
      await writeFile(join(root, "package-lock.json"), JSON.stringify({
        name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": manifest },
      }));
      await writeFile(join(root, "CHANGELOG.md"), cases[0].input);
      const config = JSON.parse(await readFile(new URL("../.release-it.json", import.meta.url), "utf8"));
      // Verify published refs/integrity without creating a real GitHub Release.
      config.hooks["after:release"] = [config.hooks["before:github:release"], ...config.hooks["after:release"]];
      config.github = false;
      await writeFile(join(root, ".release-it.json"), JSON.stringify(config));
      await mkdir(join(root, "scripts"));
      await writeFile(join(root, "scripts/release.js"), `
import { execFileSync } from "node:child_process";
import process from "node:process";
execFileSync(process.execPath, [
  ${JSON.stringify(fileURLToPath(new URL("../scripts/release.js", import.meta.url)))}, ...process.argv.slice(2),
], { stdio: "inherit" });
`);
      const bin = join(root, "bin");
      await mkdir(bin);
      const npm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();
      await writeFile(join(bin, "npm"), `#!${process.execPath}
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";
const args = process.argv.slice(2);
if (args[0] === "view") {
  if (!existsSync(".release/published")) {
    console.log('{"error":{"code":"E404"}}');
    process.exit(1);
  }
  assert.ok(existsSync(".release/next-tested"), "Prepare and validate development before registry confirmation.");
  assert.notEqual(JSON.parse(readFileSync("package.json", "utf8")).version,
    readFileSync(".release/published", "utf8"));
  console.log(JSON.stringify([{version:readFileSync(".release/published", "utf8"),
    "dist.integrity":"sha512-" + createHash("sha512").update("validated artifact").digest("base64")}]));
} else if (args[0] === "pack") {
  assert.ok(!existsSync(".release/package.tgz"), "Pack the release only once.");
  assert.ok(readFileSync("README.md", "utf8").includes(
    "eslint-plugin-prose-spellcheck@" + JSON.parse(readFileSync("package.json", "utf8")).version));
  writeFileSync(".release/fixture.tgz", "validated artifact");
  console.log(JSON.stringify({"release-fixture":{filename:"fixture.tgz"}}));
} else if (args[0] === "test" || (args[0] === "run" && args[1] === "lint")) {
  process.exit(0);
} else if (args[0] === "run" && args[1] === "test:package") {
  if (process.env.PROSE_SPELLCHECK_PACKAGE_ARCHIVE) {
    assert.equal(readFileSync(process.env.PROSE_SPELLCHECK_PACKAGE_ARCHIVE, "utf8"), "validated artifact");
    writeFileSync(".release/tested", "tested");
  } else {
    assert.ok(existsSync(".release/published"), "Validate the next version after publication.");
    writeFileSync(".release/next-tested", "tested");
  }
} else if (args[0] === "publish") {
  assert.equal(args[1], ".release/package.tgz");
  assert.equal(readFileSync(args[1], "utf8"), "validated artifact");
  assert.ok(existsSync(".release/tested"), "Validate the exact archive before publication.");
  assert.ok(!existsSync(".release/published"), "Do not publish the next development version.");
  writeFileSync(".release/published", JSON.parse(readFileSync("package.json", "utf8")).version);
} else {
  process.stdout.write(execFileSync(${JSON.stringify(npm)}, args, {encoding:"utf8"}));
}
`);
      await chmod(join(bin, "npm"), 0o755);
      git("add", ".");
      git("commit", "-m", "Fixture");
      git("push", "-u", "origin", "master");
      execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/release.js", import.meta.url))], {
        cwd: root, encoding: "utf8", stdio: "pipe",
        env: {
          ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/master",
          RELEASE_VERSION: mode === "version override" ? released : "", PROSE_SPELLCHECK_PACKAGE_ARCHIVE: "",
          GITHUB_STEP_SUMMARY: join(root, ".release/summary.md"),
          PATH: `${bin}${delimiter}${process.env.PATH}`,
        },
      });
      assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version, nextVersion(released));
      assert.equal(JSON.parse(git("show", `v${released}:package.json`)).version, released);
      assert.equal(JSON.parse(git("show", `v${released}:package-lock.json`)).packages[""].version, released);
      assert.equal(git("show", `v${released}:README.md`), readme.replace("@0.1.0", `@${released}`));
      assert.equal(await readFile(join(root, "README.md"), "utf8"), readme.replace("@0.1.0", `@${released}`));
      assert.ok((await readFile(join(root, "CHANGELOG.md"), "utf8")).includes(`## ${nextVersion(released)} (Next)`));
      assert.equal(git("ls-remote", "origin", "refs/heads/master").split(/\s/u)[0], git("rev-parse", "HEAD").trim());
      assert.equal(git("tag", "--list").trim(), `v${released}`);
      assert.match(git("log", "-2", "--format=%B"), /Co-authored-by: Copilot/u);
      assert.equal(git("status", "--porcelain"), "");
      assert.match(await readFile(join(root, ".release/verification.txt"), "utf8"), /Verified npm release/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
