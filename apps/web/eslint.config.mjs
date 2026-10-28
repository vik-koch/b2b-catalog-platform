import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import { classLines } from '../../tools/lint/class-lines.mjs';
import {
  classFieldColours,
  tailwindChecks,
} from '../../tools/lint/colour-roles.mjs';

/*
 * The UI library is imported one file at a time: chunks are cut by module,
 * so a path that names a group (or the library) would be a barrel, and a
 * barrel carries everything in it into the first load.
 */
const UI_BARREL = {
  regex: '^@b2b-catalog-platform/ui(/[\\w-]+)?$',
  message:
    'Import a file of the UI library, not the library or a group of it (see libs/ui/README.md).',
};

/* What a view in a `ui/` folder may not reach for: data (ADR 0072). */
const VIEW_MESSAGE =
  'A view takes inputs and gives outputs; services and API clients belong to its container (ADR 0072).';
const VIEW_PATTERNS = [
  { regex: '^\\.{1,2}/(.*/)?[\\w.-]+\\.service$', message: VIEW_MESSAGE },
  {
    regex: '(^|/)(orpc-client|contract-routes\\.generated)$',
    message: VIEW_MESSAGE,
  },
  { group: ['@angular/common/http', '@orpc/*'], message: VIEW_MESSAGE },
];

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  ...classLines,
  tailwindChecks(`${import.meta.dirname}/src/styles.css`, [
    // Plain classes styles.css defines outside Tailwind.
    '^text-stable$',
    '^logo-mark$',
    '^elsewhere-mark$',
    '^listing-held$',
    '^cart-(count|total)$',
  ]),
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      // An attribute component keeps a native element and its semantics, as
      // `a[appActionLink]` keeps the anchor, its router link and its query.
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'app', style: 'kebab-case' },
          { type: 'attribute', prefix: 'app', style: 'camelCase' },
        ],
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@nestjs/*'] }, UI_BARREL],
        },
      ],
    },
  },
  // The app's three parts: the storefront and the admin each import shared
  // code and never each other, shared code imports neither, and only the root
  // (app.ts, app.config*, app.routes*) composes both. Their wording follows
  // the same line: each side reads its own text and the shared text, and only
  // shared code, showing one side's view to the other, reads both; a spec may,
  // to set the scene. A later block replaces an earlier
  // `no-restricted-imports` rather than adding to it, so each one repeats the
  // server-package pattern above.
  ...[
    {
      part: 'storefront',
      forbidden: ['admin'],
      text: 'admin-text',
      entries: ['admin', 'sync', 'node'],
    },
    {
      part: 'admin',
      forbidden: ['storefront'],
      text: 'storefront-text',
      entries: ['storefront', 'node'],
    },
    {
      part: 'shared',
      forbidden: ['storefront', 'admin'],
      entries: ['storefront', 'admin', 'sync', 'node'],
    },
  ].flatMap(({ part, forbidden, text, entries }) => {
    const dir = `src/app/${part}/**`;
    const serverSide = [`${dir}/*.server.ts`, `${dir}/*.fixture.ts`];
    // What only runs on the server or in a test may load the deployment's
    // files through the library's `node` entry.
    const offServer = entries.filter((entry) => entry !== 'node');
    return [
      {
        files: [`${dir}/*.ts`],
        ignores: [`${dir}/*.spec.ts`, ...serverSide],
        rules: rulesFor(part, forbidden, entries, text),
      },
      {
        files: serverSide,
        rules: rulesFor(part, forbidden, offServer, text),
      },
      {
        files: [`${dir}/*.spec.ts`],
        rules: rulesFor(part, forbidden, offServer),
      },
      // Views (ADR 0072): a later block replaces the earlier rule, so these
      // carry the part's own patterns as well.
      {
        files: [`${dir}/ui/**/*.ts`],
        ignores: [`${dir}/*.spec.ts`, ...serverSide],
        rules: rulesFor(part, forbidden, entries, text, VIEW_PATTERNS),
      },
    ];
  }),
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];

function rulesFor(part, forbidden, entries, text, extra = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@nestjs/*'] },
          UI_BARREL,
          {
            regex: `^\\.{1,2}/(.*/)?(${forbidden.join('|')})(/|$)`,
            message: `${part} code imports shared code, not ${forbidden.join(' or ')} code (see eslint.config.mjs).`,
          },
          {
            regex: `^@b2b-catalog-platform/shared/(${entries.join('|')})$`,
            message: `${part} code imports the shared library's root entry${part === 'shared' ? ' only' : ` and its own, not ${entries.join(' or ')}`} (see eslint.config.mjs).`,
          },
          ...(text
            ? [
                {
                  regex: `(^|/)config/${text}(\\.\\w+)?$`,
                  message: `${part} code reads its own text and the shared text, not ${text} (see eslint.config.mjs).`,
                },
              ]
            : []),
          ...extra,
        ],
      },
    ],
    // The rule above sees static imports only; a lazy `import()` is the usual
    // way across.
    'no-restricted-syntax': [
      'error',
      {
        selector: `ImportExpression[source.value=/^\\.{1,2}\\/(.*\\/)?(${forbidden.join('|')})(\\/|$)/]`,
        message: `${part} code imports shared code, not ${forbidden.join(' or ')} code, lazily or not (see eslint.config.mjs).`,
      },
      ...classFieldColours,
    ],
  };
}
