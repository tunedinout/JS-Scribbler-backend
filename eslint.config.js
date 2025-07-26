// eslint.config.js
const eslintPluginNode = require('eslint-plugin-node')

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'dist/**', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script'
    },
    plugins: {
      node: eslintPluginNode
    },
    rules: {
      semi: ['off'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'no-console': 'off',
      'no-unused-vars': ['warn']
    }
  }
]
