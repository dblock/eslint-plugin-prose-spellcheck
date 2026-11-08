import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDictionary } from "cspell-lib";

const packages = new Map();
const bundledRequire = createRequire(import.meta.url);
let preparation = 0;
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const vocabularyWord = /^\p{L}[\p{L}\p{M}\p{N}_]*(?:['’.-][\p{L}\p{M}\p{N}_]+)*$/u;

function requireWord(word, source) {
  if (typeof word !== "string" || !vocabularyWord.test(word)) {
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

async function loadPackage(filename) {
  const config = JSON.parse(await readFile(filename, "utf8"));
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
  const attempt = ++preparation;
  const definitions = config.dictionaryDefinitions
    .filter((definition) => !selected?.length || selected.includes(definition.name))
    .filter((definition) => definition.kind !== "suggestions")
    .map((definition, index) => {
      // Unique preparation names keep CSpell's failed-load cache out of retries.
      return {
        name: `prose-spellcheck:${filename}:${attempt}:${index}`,
        path: localPath(definition.path, dirname(filename)),
        type: definition.type,
        kind: definition.kind,
        repMap: definition.repMap,
        noSuggest: definition.noSuggest,
        ignoreForbiddenWords: definition.ignoreForbiddenWords,
      };
    });
  if (!definitions.length) throw new TypeError(`No spelling dictionaries selected in ${filename}.`);
  const dictionary = await getDictionary({
    dictionaries: definitions.map((definition) => definition.name),
    dictionaryDefinitions: definitions,
  });
  const errors = dictionary.getErrors();
  if (errors.length) throw new AggregateError(errors, `Cannot load dictionaries from ${filename}.`);
  return dictionary;
}

function packageDictionary(filename) {
  let pending = packages.get(filename);
  if (!pending) {
    pending = loadPackage(filename).catch((error) => {
      packages.delete(filename);
      throw error;
    });
    packages.set(filename, pending);
  }
  return pending;
}

export async function prepareDictionaries(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Spellchecker options must be an object.");
  }
  for (const key of Object.keys(options)) {
    if (!["dictionaries", "baseDir", "words"].includes(key)) {
      throw new TypeError(`Unknown spellchecker option: ${key}.`);
    }
  }
  const { dictionaries = ["@cspell/dict-en_us"], baseDir = process.cwd(), words = [] } = options;
  if (typeof baseDir !== "string" || !baseDir.trim()) throw new TypeError("baseDir must be a nonempty path.");
  if (!Array.isArray(dictionaries) || !dictionaries.length ||
      dictionaries.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new TypeError("dictionaries must be a nonempty array of package names or .txt paths.");
  }
  if (!Array.isArray(words)) throw new TypeError("words must be an array.");
  const vocabulary = new Set(words.map((word) => requireWord(word, "words")));
  const directory = resolve(baseDir);
  const consumerRequire = createRequire(resolve(directory, "package.json"));
  const loaded = await Promise.all(dictionaries.map(async (entry) => {
    if (entry.endsWith(".txt")) {
      const filename = localPath(entry, directory);
      const text = await readFile(filename, "utf8");
      for (const [index, line] of text.replace(/^\uFEFF/u, "").split(/\r?\n/u).entries()) {
        const word = line.trim();
        if (word && !word.startsWith("#")) vocabulary.add(requireWord(word, `${filename}:${index + 1}`));
      }
      return undefined;
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
  }));
  const dictionariesToCheck = loaded.filter(Boolean);
  return {
    has(word) {
      const normalized = word.replaceAll("’", "'");
      return vocabulary.has(normalized) ||
        dictionariesToCheck.some((dictionary) => dictionary.has(normalized, { ignoreCase: false }));
    },
  };
}
