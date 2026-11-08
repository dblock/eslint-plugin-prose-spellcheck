import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { collectionCases, prepareCollection } from "../scripts/spelling-fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const entry = new URL("../src/index.js", import.meta.url).href;
const config = (await readFile(new URL("./fixtures/package/eslint.config.js.txt", import.meta.url), "utf8"))
  .replace('"eslint-plugin-prose-spellcheck"', JSON.stringify(entry));

for (const fixture of collectionCases) {
  test(`Collection CLI: ${fixture.name}`, async () => {
    const directory = await mkdtemp(join(root, ".spelling-fixture-"));
    try {
      await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
      await prepareCollection(fixture, directory, config);
      const before = await readFile(join(directory, "input.md"), "utf8");
      const result = spawnSync(process.execPath, [cli, ...fixture.args], {
        cwd: directory, encoding: "utf8",
      });
      assert.ifError(result.error);
      assert.equal(result.status, fixture.error ? 1 : 0, result.stderr);
      assert.equal(result.stdout, fixture.stdout ?? "");
      if (fixture.error) assert.match(result.stderr, new RegExp(fixture.error, "iu"));
      assert.equal(await readFile(join(directory, "input.md"), "utf8"), before);
      for (const [file, text] of Object.entries(fixture.files ?? {})) {
        assert.equal(await readFile(join(directory, file), "utf8"), text);
      }
      if (fixture.output) {
        assert.equal(await readFile(join(directory, fixture.output.file), "utf8"), fixture.output.text);
      }
      if (fixture.absent) {
        await assert.rejects(readFile(join(directory, fixture.absent)), { code: "ENOENT" });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
