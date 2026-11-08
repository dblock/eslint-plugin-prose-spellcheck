import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

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

function diagnostics(results) {
  return results.flatMap((result) =>
    result.messages.map(({ ruleId, line, column }) => ({ ruleId, line, column })),
  );
}

try {
  const packResult = JSON.parse(runNpm([
    "pack", "--json", "--pack-destination", temporary,
  ], root));
  const [packed] = Array.isArray(packResult) ? packResult : Object.values(packResult);
  const archive = join(temporary, packed.filename);
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .trim().split(/\r?\n/u).map((entry) => entry.replace(/^package\//u, "")).sort();
  const expectedEntries = JSON.parse(await readFile(new URL("archive.json", fixtures), "utf8"));
  assert.deepEqual(entries, expectedEntries);

  for (const file of [
    "package.json", "eslint.config.js.txt", "api.mjs.txt", "valid.md", "invalid.md",
  ]) {
    await copyFile(new URL(file, fixtures), join(temporary, file.replace(/\.txt$/u, "")));
  }
  runNpm([
    "install", "--ignore-scripts", "--no-audit", "--no-fund",
    "--engine-strict", "--strict-peer-deps", "--save-exact", archive,
  ], temporary);

  const cases = JSON.parse(await readFile(new URL("cases.json", fixtures), "utf8"));
  for (const fixture of cases) {
    const api = runNode(["api.mjs", fixture.file]);
    assert.equal(api.status, 0, api.stderr);
    assert.deepEqual(diagnostics(JSON.parse(api.stdout)), fixture.diagnostics);

    const cli = runNode([
      join(temporary, "node_modules/eslint/bin/eslint.js"),
      "--format", "json", fixture.file,
    ]);
    assert.equal(cli.status, fixture.diagnostics.length ? 1 : 0, cli.stderr);
    assert.deepEqual(diagnostics(JSON.parse(cli.stdout)), fixture.diagnostics);
  }
  process.stdout.write(`Validated ${packed.filename}: ${entries.length} archive entries and ${cases.length} API/CLI fixtures.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
