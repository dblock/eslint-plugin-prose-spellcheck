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
      context: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write("Usage: eslint-prose-spellcheck collect [--config path] [--output path | --context] <files/globs...>\nReview candidates before adding them to dictionaries. Existing files are never overwritten.\nUse --context for tab-separated words and file:line:column locations on stdout.\n");
  } else {
    const [command, ...patterns] = positionals;
    if (command !== "collect" || !patterns.length) {
      throw new Error("Expected collect and at least one file or glob. Use --help for usage.");
    }
    if (values.config !== undefined && !values.config.trim()) {
      throw new Error("--config must be a nonempty path.");
    }
    if (values.context && values.output !== undefined) {
      throw new Error("--context cannot be combined with --output.");
    }
    const words = await collectWords(patterns, {
      cwd: process.cwd(),
      ...(values.config ? { overrideConfigFile: resolve(values.config) } : {}),
    });
    const lines = words.map(({ word, file, line, column }) =>
      values.context ? `${word}\t${file}:${line}:${column}` : word,
    );
    const text = lines.length ? `${lines.join("\n")}\n` : "";
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
