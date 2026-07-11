const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'build/', 'coverage/', 'frontend/', 'apps/'],
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
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // Tests need dynamic require() to re-load modules after jest.resetModules()
    // (e.g. presets.ts and annotations.ts capture os.homedir() at module load).
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
