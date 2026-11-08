import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { checkWorkflowNames } from "../scripts/check-workflow-names.js";

const directory = new URL("./fixtures/workflows/", import.meta.url);
const cases = JSON.parse(await readFile(new URL("cases.json", directory), "utf8"));
const script = fileURLToPath(new URL("../scripts/check-workflow-names.js", import.meta.url));

for (const fixture of cases) {
  test(`Workflow names: ${fixture.name}`, async () => {
    const text = await readFile(new URL(fixture.file, directory), "utf8");
    if (fixture.parseError) {
      assert.throws(() => checkWorkflowNames(text));
    } else {
      assert.deepEqual(checkWorkflowNames(text), fixture.diagnostics);
    }
  });
}

for (const [name, expectedStatus] of [["valid", 0], ["invalid", 1], ["malformed", 1]]) {
  test(`Workflow name CLI: ${name}`, () => {
    const result = spawnSync(process.execPath, [
      script,
      fileURLToPath(new URL(name, directory)),
    ], { encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(result.stderr.length > 0, expectedStatus !== 0);
  });
}
