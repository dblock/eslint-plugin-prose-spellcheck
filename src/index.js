import packageJson from "../package.json" with { type: "json" };
import { prepareDictionaries } from "./dictionaries.js";
import { createSpellchecker } from "./spellchecker.js";

export async function createPlugin(options = {}) {
  const dictionary = await prepareDictionaries(options);
  return {
    meta: { name: packageJson.name, version: packageJson.version },
    rules: { spellchecker: createSpellchecker(dictionary) },
  };
}

export default createPlugin;
