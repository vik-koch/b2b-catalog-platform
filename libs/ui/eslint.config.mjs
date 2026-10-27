import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import {
  classFieldColours,
  tailwindChecks,
} from '../../tools/lint/colour-roles.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  tailwindChecks(`${import.meta.dirname}/src/ui.css`),
  {
    files: ['**/*.ts'],
    rules: {
      // The `ui` prefix comes with the rename at the end of the move; until
      // then a moved piece keeps the selector its templates already use.
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
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
