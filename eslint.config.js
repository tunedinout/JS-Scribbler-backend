// eslint.config.js  (flat config)
const pluginNode = require('eslint-plugin-node')
const pluginImport = require('eslint-plugin-import')
const pluginUnused = require('eslint-plugin-unused-imports')
const pluginSecurity = require('eslint-plugin-security')
const pluginPromise = require('eslint-plugin-promise')

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'dist/**', '*.config.js'],
    languageOptions: { ecmaVersion: 2021, sourceType: 'script' },
    plugins: {
      node: pluginNode,
      import: pluginImport,
      'unused-imports': pluginUnused,
      security: pluginSecurity,
      promise: pluginPromise
    },
    rules: {
      semi: 'off',
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'no-console': 'off',
      'no-unused-vars': 'warn',
      'import/no-unresolved': 'error',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }
      ],
      'security/detect-object-injection': 'warn',
      'security/detect-unsafe-regex': 'error',
      'promise/always-return': 'warn',
      'promise/no-return-wrap': 'warn',
      'promise/no-nesting': 'warn'
    }
  }
]
