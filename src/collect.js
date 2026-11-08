import { relative, sep } from "node:path";
import { ESLint } from "eslint";
import packageJson from "../package.json" with { type: "json" };

export async function collectWords(patterns, options) {
  const eslint = new ESLint(options);
  const results = await eslint.lintFiles(patterns);
  const words = new Map();
  let selected = 0;
  for (const result of results.sort((left, right) => left.filePath < right.filePath ? -1 : 1)) {
    if (await eslint.isPathIgnored(result.filePath)) continue;
    const config = await eslint.calculateConfigForFile(result.filePath);
    if (!config) continue;
    const rules = new Set(Object.entries(config.rules).filter(([id, severity]) => {
      const slash = id.lastIndexOf("/");
      const plugin = config.plugins[id.slice(0, slash)];
      return id.slice(slash + 1) === "spellcheck" &&
        plugin?.meta?.name === packageJson.name && severity[0] !== 0;
    }).map(([id]) => id));
    if (!rules.size) continue;
    selected++;
    for (const message of result.messages) {
      if (rules.has(message.ruleId) && message.messageId === "unknownWord") {
        const match = message.message.match(/^Unknown word: "([\s\S]+)"\.$/u);
        if (!match) throw new Error("Unexpected spelling diagnostic.");
        const word = match[1];
        if (!words.has(word)) {
          words.set(word, {
            word,
            file: relative(options.cwd, result.filePath).split(sep).join("/"),
            line: message.line,
            column: message.column,
          });
        }
      } else if (message.severity === 2) {
        throw new Error(`${result.filePath}: ${message.message}`);
      }
    }
  }
  if (!selected) throw new Error("No files with an enabled spelling rule were selected.");
  return [...words.keys()].sort().map((word) => words.get(word));
}
