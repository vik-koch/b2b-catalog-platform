import baseConfig from '../../eslint.config.mjs';
import { areaBoundaries } from '../../tools/lint/area-boundaries.mjs';

export default [
  ...baseConfig,
  areaBoundaries('src'),
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/esbuild.config.{js,ts,mjs,mts}',
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@angular/*', '@angular-devkit/*', '@nestjs/*'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  // One folder per entry point. What every side reads (src/lib) imports none
  // of the others; an audience's folder imports src/lib and itself, and the
  // admin's also the exchange it watches. `node` is the server's and may read
  // anything.
  ...[
    { folder: 'lib', forbidden: ['storefront', 'admin', 'sync', 'node'] },
    { folder: 'storefront', forbidden: ['admin', 'sync', 'node'] },
    { folder: 'admin', forbidden: ['storefront', 'node'] },
    { folder: 'sync', forbidden: ['storefront', 'admin', 'node'] },
  ].map(({ folder, forbidden }) => ({
    files: [`src/${folder}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(\\.\\./)+(${forbidden.join('|')})/`,
              message: `src/${folder} imports src/lib and its own folder, not ${forbidden.join(' or ')} (see eslint.config.mjs).`,
            },
          ],
        },
      ],
    },
  })),
];
