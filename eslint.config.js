const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'build/', 'coverage/', 'frontend/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off'
    }
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // `const test = require('node:test')` and `require('crypto')` shadow same-named globals.
      'no-redeclare': ['error', { builtinGlobals: false }]
    }
  },
  {
    files: ['apps/chrome-extension/**/*.js'],
    ignores: ['apps/chrome-extension/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly', GhuiLink: 'readonly' }
    }
  },
  {
    // Tests need dynamic require() to re-load modules after jest.resetModules()
    // (e.g. presets.ts and annotations.ts capture os.homedir() at module load).
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
