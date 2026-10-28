import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import { classLines } from '../../tools/lint/class-lines.mjs';
import {
  classFieldColours,
  tailwindChecks,
} from '../../tools/lint/colour-roles.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  ...classLines,
  tailwindChecks(`${import.meta.dirname}/src/ui.css`, [
    // The argument of a `[class.text-right]` comparison reads as one.
    '^right$',
  ]),
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'ui', style: 'camelCase' },
      ],
      // Attribute components on native elements, as in the app.
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'ui', style: 'kebab-case' },
          { type: 'attribute', prefix: 'ui', style: 'camelCase' },
        ],
      ],
      // The library knows Angular and itself: no domain, no deployment, no
      // app. What a piece needs from them (its words, a locale) it is given.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@b2b-catalog-platform/*', '@nestjs/*'],
              message:
                'The UI library imports Angular and its own files only (see libs/ui/README.md).',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...classFieldColours],
    },
  },
];
