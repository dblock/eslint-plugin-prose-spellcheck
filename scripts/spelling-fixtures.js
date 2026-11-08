import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL, URL } from "node:url";

export const spellingFixtures = new URL("../test/fixtures/spelling/", import.meta.url);
export const spellingCases = JSON.parse(await readFile(new URL("cases.json", spellingFixtures), "utf8"));

export async function prepareFixture(fixture, directory) {
  let text = await readFile(new URL(fixture.file ?? "valid.md", spellingFixtures), "utf8");
  if (fixture.lineEnding === "crlf") text = text.replace(/\r?\n/gu, "\r\n");
  if (fixture.finalNewline === false) text = text.replace(/\r?\n$/u, "");
  await writeFile(join(directory, "input.md"), text);
  await writeFile(join(directory, "accepted.txt"), "# Reviewed vocabulary\nZqxbrand\nZqxbrandTool\n");
  for (const [filename, value] of Object.entries(fixture.files ?? {})) {
    await writeFile(join(directory, filename), value);
  }
  if (fixture.dictionaryPackage) {
    const pkg = fixture.dictionaryPackage;
    const path = join(directory, "node_modules/@prose-test/dictionary");
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "package.json"), JSON.stringify({
      name: "@prose-test/dictionary",
      version: "0.0.0",
      exports: pkg.executable ? "./dictionary.js" : "./cspell-ext.json",
    }));
    await writeFile(join(path, "cspell-ext.json"),
      typeof pkg.config === "string" ? pkg.config : JSON.stringify(pkg.config));
    if (pkg.executable) {
      await writeFile(join(path, "dictionary.js"), "throw new Error('Dictionary code must never execute.');\n");
    }
    for (const [filename, value] of Object.entries(pkg.files ?? {})) {
      await writeFile(join(path, filename),
        typeof value === "object" ? Buffer.from(value.base64, "base64") : value);
    }
  }
  await writeFile(join(directory, "fixture.json"), JSON.stringify({
    ...fixture,
    options: fixtureOptions(fixture, directory),
  }));
  return text;
}

export function fixtureOptions(fixture, directory) {
  const options = Object.hasOwn(fixture, "options") ? fixture.options : {};
  if (!options || typeof options !== "object" || Array.isArray(options)) return options;
  const prepared = { baseDir: directory, ...options };
  if (Array.isArray(prepared.dictionaries)) {
    prepared.dictionaries = prepared.dictionaries.map((entry) =>
      entry === "$VOCABULARY_URL" ? pathToFileURL(join(directory, "accepted.txt")).href : entry,
    );
  }
  return prepared;
}

export function fixtureDiagnostics(text, reports = [], namespace = "prose-spellcheck") {
  return reports.map((report) => {
    let start = -1;
    for (let count = 0; count < (report.occurrence ?? 1); count++) {
      start = text.indexOf(report.source, start + 1);
      assert.notEqual(start, -1, `Missing expected source span: ${report.source}.`);
    }
    function location(index) {
      const lines = text.slice(0, index).split(/\r\n|\r|\n/u);
      return [lines.length, lines.at(-1).length + 1];
    }
    const [line, column] = location(start);
    const [endLine, endColumn] = location(start + report.source.length);
    if (report.location) assert.deepEqual([line, column, endLine, endColumn], report.location);
    return { ruleId: `${namespace}/spellchecker`, messageId: "unknownWord", word: report.word,
      line, column, endLine, endColumn };
  });
}

export function spellingDiagnostics(messages) {
  return messages.map(({ ruleId, messageId, message, line, column, endLine, endColumn, fix, suggestions }) => {
    assert.equal(fix, undefined, "Spelling must not provide automatic fixes.");
    assert.equal(suggestions, undefined, "Spelling suggestions are outside this version.");
    const match = message.match(/^Unknown word: "([\s\S]+)"\.$/u);
    assert.ok(match, message);
    return { ruleId, messageId, word: match[1], line, column, endLine, endColumn };
  });
}

export const collectionCases = JSON.parse(await readFile(
  new URL("../test/fixtures/collection/cases.json", import.meta.url), "utf8",
));

export async function prepareCollection(fixture, directory, configText) {
  const spelling = spellingCases.find((entry) => entry.name === fixture.spelling);
  await prepareFixture({
    ...spelling,
    severity: fixture.severity,
    noRule: fixture.noRule,
    rules: fixture.rules,
    files: { ...spelling.files, ...fixture.files },
  }, directory);
  await writeFile(join(directory, "eslint.config.js"), configText);
  if (fixture.explicitConfig) {
    await writeFile(join(directory, fixture.explicitConfig), configText);
    await writeFile(join(directory, "eslint.config.js"), "throw new Error('Wrong config selected.');\n");
  }
}
