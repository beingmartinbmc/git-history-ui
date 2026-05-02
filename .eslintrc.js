module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  ignorePatterns: ['dist/', 'build/', 'coverage/', 'frontend/', 'demo.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ],
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  },
  overrides: [
    {
      // Tests need dynamic require() to re-load modules after jest.resetModules()
      // (e.g. presets.ts and annotations.ts capture os.homedir() at module load).
      files: ['src/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ]
};
