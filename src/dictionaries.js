import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  createCollection, createFlagWordsDictionary, createFlagWordsDictionaryFromTrieFile,
  createSpellingDictionary, createSpellingDictionaryFromTrieFile,
  createSuggestDictionary, createSuggestDictionaryFromTrieFile,
} from "cspell-dictionary";

const packages = new Map();
const bundledRequire = createRequire(import.meta.url);
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const vocabularyWord = /^\p{L}[\p{L}\p{M}\p{N}_]*(?:['’.-][\p{L}\p{M}\p{N}_]+)*$/u;
const constructors = new Map([
  ["flag-words", [createFlagWordsDictionary, createFlagWordsDictionaryFromTrieFile]],
  ["suggest-words", [createSuggestDictionary, createSuggestDictionaryFromTrieFile]],
]);

function requireWord(word, source) {
  if (!vocabularyWord.test(word)) {
    throw new TypeError(`Invalid vocabulary word in ${source}: ${JSON.stringify(word)}.`);
  }
  return word.replaceAll("’", "'");
}

function localPath(value, baseDir) {
  if (value.startsWith("file:")) return fileURLToPath(value);
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    throw new TypeError(`Remote dictionaries are not supported: ${value}.`);
  }
  return resolve(baseDir, value);
}

function loadPackage(filename) {
  const config = JSON.parse(readFileSync(filename, "utf8"));
  if (!config || !Array.isArray(config.dictionaryDefinitions) || !config.dictionaryDefinitions.length) {
    throw new TypeError(`No dictionary definitions in ${filename}.`);
  }
  for (const definition of config.dictionaryDefinitions) {
    if (!definition || typeof definition !== "object" ||
        typeof definition.name !== "string" || !definition.name ||
        typeof definition.path !== "string" || !definition.path ||
        (definition.type !== undefined && !["S", "W", "C", "T"].includes(definition.type))) {
      throw new TypeError(`Invalid dictionary definition in ${filename}.`);
    }
  }
  const selected = config.dictionaries;
  if (selected !== undefined && (!Array.isArray(selected) || selected.some((name) => typeof name !== "string"))) {
    throw new TypeError(`Invalid dictionary selection in ${filename}.`);
  }
  const definitions = config.dictionaryDefinitions
    .filter((definition) => !selected?.length || selected.includes(definition.name))
    .filter((definition) => definition.kind !== "suggestions")
    .map((definition) => ({ ...definition, path: localPath(definition.path, dirname(filename)) }));
  if (!definitions.length) throw new TypeError(`No spelling dictionaries selected in ${filename}.`);
  try {
    const dictionaries = definitions.map((definition) => {
      let data = readFileSync(definition.path);
      if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
      const [fromWords, fromTrie] = constructors.get(definition.kind) ??
        [createSpellingDictionary, createSpellingDictionaryFromTrieFile];
      const options = { ...definition, noSuggest: definition.noSuggest || definition.kind === "ignore-words" };
      if (definition.type === "T" || /\.b?trie\b/iu.test(definition.path)) {
        return fromTrie(data, definition.name, definition.path, options);
      }
      let lines = data.toString("utf8").split(/\r\n|\r|\n/u);
      const split = definition.type === "C" ? /[^\w\p{L}\p{M}'’]+/u : /\s+/u;
      const legacy = ["C", "W"].includes(definition.type);
      if (legacy) {
        lines = lines.flatMap((line) => line.replace(/#.*/u, "").split(split)).filter(Boolean);
      }
      return fromWords(lines, definition.name, definition.path, options, legacy);
    });
    return createCollection(dictionaries, filename);
  } catch (error) {
    throw new Error(`Cannot load dictionaries from ${filename}.`, { cause: error });
  }
}

function packageDictionary(filename) {
  if (!packages.has(filename)) packages.set(filename, loadPackage(filename));
  return packages.get(filename);
}

export function prepareDictionaries(options, cwd) {
  const { dictionaries = ["@cspell/dict-en_us"], baseDir = cwd } = options;
  if (!baseDir.trim()) throw new TypeError("baseDir must be a nonempty path.");
  if (dictionaries.some((entry) => !entry.trim())) {
    throw new TypeError("dictionaries must be a nonempty array of package names or .txt paths.");
  }
  const vocabulary = new Set();
  const directory = resolve(cwd, baseDir);
  const consumerRequire = createRequire(resolve(directory, "package.json"));
  const loaded = dictionaries.flatMap((entry) => {
    if (entry.endsWith(".txt")) {
      const filename = localPath(entry, directory);
      const text = readFileSync(filename, "utf8");
      for (const [index, line] of text.replace(/^\uFEFF/u, "").split(/\r?\n/u).entries()) {
        const word = line.trim();
        if (word && !word.startsWith("#")) vocabulary.add(requireWord(word, `${filename}:${index + 1}`));
      }
      return [];
    }
    if (!packageName.test(entry)) throw new TypeError(`Unsupported dictionary: ${entry}.`);
    if (options.dictionaries === undefined) return packageDictionary(bundledRequire.resolve(entry));
    let filename;
    try {
      filename = consumerRequire.resolve(entry);
    } catch (error) {
      if (entry !== "@cspell/dict-en_us" || error.code !== "MODULE_NOT_FOUND") throw error;
      filename = bundledRequire.resolve(entry);
    }
    if (!filename.endsWith(".json")) throw new TypeError(`Dictionary packages must export JSON: ${entry}.`);
    return packageDictionary(filename);
  });
  return {
    has(word) {
      const normalized = word.replaceAll("’", "'");
      return vocabulary.has(normalized) ||
        loaded.some((dictionary) => dictionary.has(normalized, { ignoreCase: false }));
    },
  };
}
