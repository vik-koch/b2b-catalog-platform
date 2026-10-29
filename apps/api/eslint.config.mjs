import baseConfig from '../../eslint.config.mjs';
import { areaBoundaries } from '../../tools/lint/area-boundaries.mjs';

export default [
  ...baseConfig,
  areaBoundaries('src'),
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@angular/*', '@angular-devkit/*'],
        },
      ],
    },
  },
];
