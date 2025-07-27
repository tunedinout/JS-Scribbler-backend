import imp from "eslint-plugin-import";
import unused from "eslint-plugin-unused-imports";
import prettier from "eslint-plugin-prettier";
import security from "eslint-plugin-security"
import promise from "eslint-plugin-promise"
import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "dist/**", "*.config.js"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: imp,
      "unused-imports": unused,
      prettier,
      promise,
      security
    },

    rules: {
      // keep commonjs:true in case some `require()` survive
      "import/extensions": [
        "error",
        "ignorePackages",
        {
          "js": "always",
          "json": "always"
        }
      ],
      "import/no-unresolved": ["error"],
      "no-unused-vars": "off", // handled by…
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
      "no-undef": "error",

      /* ——— formatting delegated to Prettier ——— */
      indent: "off",
      quotes: "off",
      semi: "off",
      "prettier/prettier": [
        "error",
        {
          singleQuote: true,
          tabWidth: 2,
          semi: false,
          bracketSpacing: true,
        },
      ],

    },
    settings: {
      "import/resolver": {
      "node": {
        "extensions": [".js", ".json"] // helps ESLint understand valid imports
      }
    }
    }
  },
];
