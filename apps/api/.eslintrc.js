module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist', 'generated', 'coverage'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['prisma/**/*.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
