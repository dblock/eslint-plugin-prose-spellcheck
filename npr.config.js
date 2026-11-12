import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HookValidator, IntrideaChangelog, MarkdownSection, ReleaseWorkflow } from "npm-package-release";

export function createReleaseWorkflow(services = {}) {
  return new ReleaseWorkflow({
    changelog: new IntrideaChangelog(),
    async prepare({ cwd, version }) {
      const readme = await readFile(join(cwd, "README.md"), "utf8");
      const install = /^(npm install --save-dev eslint @eslint\/markdown eslint-plugin-prose-spellcheck@)\d+\.\d+\.\d+$/gmu;
      assert.equal([...readme.matchAll(install)].length, 1, "Require one versioned README installation command.");
      await new MarkdownSection("README.md", "## Installation").replace(install, `$1${version}`, { cwd });
    },
    validator: new HookValidator({
      async validate({ phase, run }) {
        await run("npm", ["test"]);
        await run("npm", ["run", "lint"]);
        if (phase === "next") await run("npm", ["run", "test:package"], { timeout: 600_000 });
      },
      async validateArtifact({ archive, run }) {
        await run("npm", ["run", "test:package"], {
          env: { PACKAGE_ARCHIVE: archive }, timeout: 600_000,
        });
      },
    }),
    ...services,
  });
}

export default createReleaseWorkflow();
