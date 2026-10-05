const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

module.exports = [
  js.configs.recommended,

  {
    ignores: ['dist/**', 'node_modules/**']
  },

  {
    files: ['*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly'
      }
    }
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-undef': 'off'
    }
  }
]