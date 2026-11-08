import packageJson from "../package.json" with { type: "json" };

export default {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
  },
  rules: {},
};
