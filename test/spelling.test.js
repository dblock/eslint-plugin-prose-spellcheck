import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { createPlugin } from "../src/index.js";
import { fixtureDiagnostics, fixtureOptions, prepareFixture, spellingCases, spellingDiagnostics } from "../scripts/spelling-fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));

async function linter(options, fixture = {}) {
  const plugin = await createPlugin(options);
  const namespace = fixture.namespace ?? "prose-spellcheck";
  return new ESLint({
    overrideConfigFile: true,
    fix: true,
    overrideConfig: [{
      files: ["**/*.md"],
      plugins: { markdown, [namespace]: plugin },
      language: `markdown/${fixture.language ?? "gfm"}`,
      languageOptions: { frontmatter: "yaml" },
      rules: { [`${namespace}/spellchecker`]: "error", ...fixture.rules },
    }],
  });
}

test("Bundled English remains available outside the package's directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eslint-prose-spellcheck-bundled-"));
  try {
    const eslint = await linter({ baseDir: directory, dictionaries: ["@cspell/dict-en_us"] });
    const [result] = await eslint.lintText("Hello world.", { filePath: "input.md" });
    assert.deepEqual(result.messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Already-CRLF input preserves original diagnostic lines", async () => {
  const directory = await mkdtemp(join(root, ".spelling-fixture-"));
  try {
    const filename = join(directory, "checkout.md");
    await writeFile(filename, "# Hello\r\n\r\nhelo world.\r\n");
    const fixture = { file: pathToFileURL(filename).href, lineEnding: "crlf", finalNewline: false };
    const text = await prepareFixture(fixture, directory);
    const eslint = await linter({ baseDir: directory });
    const [result] = await eslint.lintText(text, { filePath: "input.md" });
    assert.equal(text, "# Hello\r\n\r\nhelo world.");
    assert.deepEqual(spellingDiagnostics(result.messages),
      fixtureDiagnostics(text, [{ word: "helo", source: "helo", location: [3, 1, 3, 5] }]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const fixture of spellingCases) {
  test(`Spelling API: ${fixture.name}`, async () => {
    const directory = await mkdtemp(join(root, ".spelling-fixture-"));
    try {
      const text = await prepareFixture(fixture, directory);
      const run = async () => {
        const eslint = await linter(fixtureOptions(fixture, directory), fixture);
        const [result] = await eslint.lintText(text, { filePath: "input.md" });
        assert.equal(result.output, undefined, "Spelling must not rewrite source with fix enabled.");
        assert.deepEqual(spellingDiagnostics(result.messages),
          fixtureDiagnostics(text, fixture.reports, fixture.namespace));
      };
      if (fixture.error) await assert.rejects(run, new RegExp(fixture.error, "u"));
      else await run();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("Dictionary failure retries without retaining a failed engine cache entry", async () => {
  const directory = await mkdtemp(join(root, ".spelling-fixture-"));
  try {
    const fixture = spellingCases.find((entry) => entry.name === "Corrupt dictionary data");
    await prepareFixture(fixture, directory);
    const options = fixtureOptions(fixture, directory);
    await assert.rejects(createPlugin(options), /Cannot load dictionaries/u);
    await writeFile(join(directory, "node_modules/@prose-test/dictionary/words.txt.gz"), gzipSync("Zqxfixed\n"));
    const eslint = await linter(options);
    const [result] = await eslint.lintText("Zqxfixed", { filePath: "input.md" });
    assert.deepEqual(result.messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Shared package preparation keeps vocabulary snapshots instance-local", async () => {
  const directory = await mkdtemp(join(root, ".spelling-fixture-"));
  try {
    await writeFile(join(directory, "vocabulary.txt"), "Zqxfirst\n");
    const options = { baseDir: directory, dictionaries: ["@cspell/dict-en_us", "./vocabulary.txt"] };
    const [first, inline] = await Promise.all([
      linter(options), linter({ baseDir: directory, words: ["Zqxsecond"] }),
    ]);
    await writeFile(join(directory, "vocabulary.txt"), "Zqxsecond\n");
    const second = await linter(options);
    for (const [eslint, unknown] of [[first, "Zqxsecond"], [second, "Zqxfirst"], [inline, "Zqxfirst"]]) {
      const text = "Zqxfirst Zqxsecond";
      const [result] = await eslint.lintText(text, { filePath: "input.md" });
      assert.deepEqual(spellingDiagnostics(result.messages),
        fixtureDiagnostics(text, [{ word: unknown, source: unknown }]));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
