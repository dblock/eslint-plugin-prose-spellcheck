import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { ESLint } from "eslint";

const directory = new URL("./fixtures/documentation/", import.meta.url);
const cases = JSON.parse(await readFile(new URL("cases.json", directory), "utf8"));
const linters = {
  native: new ESLint({
    overrideConfigFile: fileURLToPath(new URL("../eslint.config.js", import.meta.url)),
  }),
  embedded: new ESLint({
    overrideConfigFile: fileURLToPath(new URL("../eslint.config-code-blocks.js", import.meta.url)),
  }),
};

for (const fixture of cases) {
  test(`Documentation: ${fixture.name}`, async () => {
    const text = await readFile(new URL(fixture.file, directory), "utf8");
    const [result] = await linters[fixture.mode].lintText(text, { filePath: "fixture.md" });
    assert.deepEqual(
      result.messages.map(({ ruleId, line, column }) => ({ ruleId, line, column })),
      fixture.diagnostics,
    );
  });
}
