// eslint.config.js  (flat config)
const pluginNode = require("eslint-plugin-node");
const pluginImport = require("eslint-plugin-import");
const pluginUnused = require("eslint-plugin-unused-imports");
const pluginSecurity = require("eslint-plugin-security");
const pluginPromise = require("eslint-plugin-promise");
const pluginPrettier = require("eslint-plugin-prettier");

module.exports = [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "dist/**", "*.config.js"],
    languageOptions: { ecmaVersion: 2021, sourceType: "script" },

    plugins: {
      node: pluginNode,
      import: pluginImport,
      "unused-imports": pluginUnused,
      security: pluginSecurity,
      promise: pluginPromise,
      prettier: pluginPrettier,
    },
    rules: {
      // formatting off from eslint, let prettier do it
      indent: "off",
      quotes: "off",
      semi: "off",

      //functional / best‑practice rules
      "no-console": "off",
      "no-unused-vars": "warn",
      "import/no-unresolved": "error",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "security/detect-object-injection": "warn",
      "security/detect-unsafe-regex": "error",
      "promise/always-return": "warn",
      "promise/no-return-wrap": "warn",
      "promise/no-nesting": "warn",

      /* Prettier as the *only* formatter */
      "prettier/prettier": [
        "error",
        { singleQuote: true, tabWidth: 2, semi: true },
      ],
    },

    settings: {},
  },
  // Load eslint‑config‑prettier last to auto‑disable any forgotten style rule
  require("eslint-config-prettier"),
];
