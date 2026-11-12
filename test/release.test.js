import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import test from "node:test";
import { ReleaseTestProject } from "npm-package-release/testing";
import { createReleaseWorkflow } from "../npr.config.js";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const version = manifest.version;
const [major, minor, patch] = version.split(".").map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;

async function fixture(t, newline = "\n") {
  const project = await ReleaseTestProject.create();
  t.after(() => project.dispose());
  await project.write("README.md", (await readFile(new URL("README.md", root), "utf8")).replace(/\r?\n/gu, newline));
  await project.write("CHANGELOG.md", [
    "# Changelog", "", `## ${version} (Next)`, "",
    "- Validate release configuration.", "- Your contribution here.", "",
  ].join(newline));
  await project.write("package.json", JSON.stringify({
    name: manifest.name, version, type: "module", exports: "./index.js",
    files: ["index.js", "README.md", "CHANGELOG.md"],
    repository: manifest.repository,
    scripts: { test: "node --check index.js", lint: "node --check index.js" },
  }, null, 2) + "\n");
  await project.write("index.js", "export default {};\n");
  await project.commit();
  return project;
}

for (const newline of ["\n", "\r\n"]) {
  test(`Release configuration preserves published README pin and validates both iterations (${JSON.stringify(newline)})`, async (t) => {
    const project = await fixture(t, newline);
    const checks = [];
    const result = await createReleaseWorkflow(project.services).run({
      ...project.options,
      async run(program, args, options) {
        if (program === "npm" && args.join(" ") === "run test:package") {
          const current = JSON.parse(await readFile(join(project.cwd, "package.json"), "utf8"));
          checks.push(current.version);
          if (current.version === version) {
            assert.ok(options.env.PACKAGE_ARCHIVE, "Release consumers must receive the retained archive.");
            const readme = await project.run("tar", ["-xOf", options.env.PACKAGE_ARCHIVE, "package/README.md"]);
            assert.ok(readme.includes(`eslint-plugin-prose-spellcheck@${version}`));
          } else {
            assert.equal(options.env.PACKAGE_ARCHIVE, "", "Development consumers must build a fresh archive.");
          }
          return "";
        }
        return project.run(program, args, options);
      },
    });
    assert.equal(result.verification, "verified");
    assert.deepEqual(checks, [version, nextVersion]);
    for (const ref of [`v${version}`, "master"]) {
      const readme = await project.remoteFile(ref, "README.md");
      assert.ok(readme.includes(`eslint-plugin-prose-spellcheck@${version}${newline}`));
      assert.ok(!readme.includes(`eslint-plugin-prose-spellcheck@${nextVersion}`));
    }
    assert.doesNotMatch(await project.remoteFile(`v${version}`, "CHANGELOG.md"), /\(Next\)/u);
    const next = await project.remoteFile("master", "CHANGELOG.md");
    assert.ok(next.startsWith(`# Changelog${newline}${newline}## ${nextVersion} (Next)${newline}`));
    assert.ok(next.includes(`- Your contribution here.${newline}`));
    assert.equal(JSON.parse(await project.remoteFile("master", "package.json")).version, nextVersion);
    const published = await readFile(project.publisher.archive(manifest.name, version));
    assert.deepEqual(published, await readFile(join(project.artifacts, result.artifact.filename)));
    assert.deepEqual(published, await readFile(project.host.archive(manifest.name, version)));
    assert.equal(await project.git("status", "--porcelain"), "");
  });
}

test("Artifact validation failure prevents publication and remote release changes", async (t) => {
  const project = await fixture(t);
  await assert.rejects(createReleaseWorkflow(project.services).run({
    ...project.options,
    async run(program, args, options) {
      if (program === "npm" && args.join(" ") === "run test:package") {
        assert.ok(options.env.PACKAGE_ARCHIVE);
        throw new Error("Packed consumer rejected the archive.");
      }
      return project.run(program, args, options);
    },
  }), /Packed consumer rejected/u);
  assert.equal(await project.publisher.view(manifest.name, version), null);
  await assert.rejects(project.remoteFile(`v${version}`, "README.md"));
  assert.equal(JSON.parse(await project.remoteFile("master", "package.json")).version, version);
});

test("Missing README installation pin fails before publication", async (t) => {
  const project = await fixture(t);
  await project.write("README.md", "# Example\n\n## Installation\n\nNo versioned command.\n");
  await project.commit();
  await assert.rejects(createReleaseWorkflow(project.services).run(project.options),
    /Require one versioned README installation command/u);
  assert.equal(await project.publisher.view(manifest.name, version), null);
});
