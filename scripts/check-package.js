import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { ESLint } from "eslint";
import { collectionCases, fixtureDiagnostics, prepareCollection, prepareFixture, spellingCases, spellingDiagnostics } from "./spelling-fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = new URL("../test/fixtures/package/", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "eslint-prose-spellcheck-package-"));

function runNode(args, cwd = temporary) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  assert.ifError(result.error);
  return result;
}

function runNpm(args, cwd) {
  assert.ok(process.env.npm_execpath, "Run package validation through npm run test:package.");
  const result = runNode([process.env.npm_execpath, ...args], cwd);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  assert.ok(process.argv.length <= 3, "Usage: npm run test:package -- [output-archive.tgz]");
  let archive = process.env.PACKAGE_ARCHIVE;
  if (archive) {
    archive = resolve(root, archive);
  } else {
    const packResult = JSON.parse(runNpm([
      "pack", "--json", "--pack-destination", temporary,
    ], root));
    const [packed] = Array.isArray(packResult) ? packResult : Object.values(packResult);
    archive = join(temporary, packed.filename);
  }
  const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
  const source = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, source.name, "Validate this package's archive.");
  assert.equal(manifest.version, source.version, "Validate the checked-in version.");
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .trim().split(/\r?\n/u).map((entry) => entry.replace(/^package\//u, "")).sort();
  const expectedEntries = JSON.parse(await readFile(new URL("archive.json", fixtures), "utf8"));
  assert.deepEqual(entries, expectedEntries);

  for (const file of ["package.json", "eslint.config.js.txt", "api.mjs.txt"]) {
    await copyFile(new URL(file, fixtures), join(temporary, file.replace(/\.txt$/u, "")));
  }
  runNpm([
    "install", "--ignore-scripts", "--no-audit", "--no-fund",
    "--engine-strict", "--strict-peer-deps", "--save-exact", archive, `eslint@${ESLint.version}`,
  ], temporary);
  const installedESLint = runNode([
    "--input-type=module", "-e", 'import { ESLint } from "eslint"; process.stdout.write(ESLint.version);',
  ]);
  assert.equal(installedESLint.status, 0, installedESLint.stderr);
  assert.equal(installedESLint.stdout, ESLint.version);

  for (const fixture of spellingCases) {
    const text = await prepareFixture(fixture, temporary);
    const api = runNode(["api.mjs", "input.md"]);
    const cli = runNode([
      join(temporary, "node_modules/eslint/bin/eslint.js"),
      "--fix", "--format", "json", "input.md",
    ]);
    if (fixture.error) {
      assert.notEqual(api.status, 0);
      assert.notEqual(cli.status, 0);
      assert.match(api.stderr, new RegExp(fixture.error, "u"));
      assert.match(cli.stderr, new RegExp(fixture.error, "u"));
    } else {
      const expected = fixtureDiagnostics(text, fixture.reports, fixture.namespace);
      assert.equal(api.status, 0, api.stderr);
      assert.equal(cli.status, expected.length ? 1 : 0, cli.stderr);
      for (const result of [api, cli]) {
        const messages = JSON.parse(result.stdout).flatMap((entry) => entry.messages);
        assert.deepEqual(spellingDiagnostics(messages), expected, fixture.name);
      }
    }
    assert.equal(await readFile(join(temporary, "input.md"), "utf8"), text);
  }
  const configText = await readFile(new URL("eslint.config.js.txt", fixtures), "utf8");
  for (const fixture of collectionCases) {
    await prepareCollection(fixture, temporary, configText);
    const before = await readFile(join(temporary, "input.md"), "utf8");
    const result = runNode([
      process.env.npm_execpath, "exec", "--no", "--", "eslint-prose-spellcheck", ...fixture.args,
    ]);
    assert.equal(result.status, fixture.error ? 1 : 0, result.stderr);
    assert.equal(result.stdout, fixture.stdout ?? "");
    if (fixture.error) assert.match(result.stderr, new RegExp(fixture.error, "iu"));
    assert.equal(await readFile(join(temporary, "input.md"), "utf8"), before);
    for (const [file, text] of Object.entries(fixture.files ?? {})) {
      assert.equal(await readFile(join(temporary, file), "utf8"), text);
    }
    if (fixture.output) {
      assert.equal(await readFile(join(temporary, fixture.output.file), "utf8"), fixture.output.text);
    }
    if (fixture.absent) {
      await assert.rejects(readFile(join(temporary, fixture.absent)), { code: "ENOENT" });
    }
  }
  if (process.argv[2]) {
    await copyFile(archive, resolve(root, process.argv[2]), constants.COPYFILE_EXCL);
  }
  process.stdout.write(`Validated ${basename(archive)} with ESLint ${ESLint.version}: ${entries.length} archive entries, ${spellingCases.length} API/ESLint CLI fixtures, and ${collectionCases.length} installed collection-command fixtures.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
