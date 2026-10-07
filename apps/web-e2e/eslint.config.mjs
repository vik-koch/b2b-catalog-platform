import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      // A skip keyed on the device shape is how a desktop-only or
      // phone-only journey is written; an unconditional skip still warns.
      'playwright/no-skipped-test': ['warn', { allowConditional: true }],
    },
  },
];
