'use strict';

const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly',
  AbortController: 'readonly', setTimeout: 'readonly', self: 'readonly', module: 'writable'
};

module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browserGlobals },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error', eqeqeq: 'error', 'prefer-const': 'error', 'no-var': 'error' }
  },
  {
    files: ['test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' } },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error', eqeqeq: 'error', 'prefer-const': 'error', 'no-var': 'error' }
  }
];
