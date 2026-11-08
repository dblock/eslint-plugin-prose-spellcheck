import packageJson from "../package.json" with { type: "json" };
import spellcheck from "./spellchecker.js";

export default {
  meta: { name: packageJson.name, version: packageJson.version },
  rules: { spellcheck },
};
