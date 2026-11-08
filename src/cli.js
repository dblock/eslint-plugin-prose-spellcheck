#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { collectWords } from "./collect.js";

try {
  const { values, positionals } = parseArgs({
    options: {
      config: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write("Usage: eslint-prose-spellcheck collect [--config path] [--output path] <files/globs...>\nReview candidates before adding them to dictionaries. Existing files are never overwritten.\n");
  } else {
    const [command, ...patterns] = positionals;
    if (command !== "collect" || !patterns.length) {
      throw new Error("Expected collect and at least one file or glob. Use --help for usage.");
    }
    if (values.config !== undefined && !values.config.trim()) {
      throw new Error("--config must be a nonempty path.");
    }
    const words = await collectWords(patterns, {
      cwd: process.cwd(),
      ...(values.config ? { overrideConfigFile: resolve(values.config) } : {}),
    });
    const text = words.length ? `${words.join("\n")}\n` : "";
    if (values.output !== undefined) {
      if (!values.output.trim()) throw new Error("--output must be a nonempty path.");
      await writeFile(resolve(values.output), text, { flag: "wx" });
      process.stderr.write("Review the candidates and remove typos before accepting this vocabulary.\n");
    } else {
      process.stdout.write(text);
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
