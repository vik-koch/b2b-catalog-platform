import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import { areaBoundaries } from '../../tools/lint/area-boundaries.mjs';
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

/* The areas whose core code reads the shared text only; the rest join as
 * their texts are cut. */
const TEXT_CUT_AREAS = ['site', 'catalog', 'accounts', 'ordering'];

/* What a view in a `ui/` folder may not reach for: data. */
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
  areaBoundaries('src/app'),
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
      // the library's `a[uiActionLink]` keeps the anchor and its router link.
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
  // The audiences and what they share: the storefront and the admin each
  // import platform and core code and never each other, platform and core
  // code import neither, and only the root (app.ts, app.config*, app.routes*)
  // composes both. Their wording follows the same line: each side reads its
  // own text and the shared text, core code the shared text only (the areas
  // in TEXT_CUT_AREAS so far), and platform code both; a spec may read any,
  // to set the scene. Areas within them are held by
  // tools/lint/area-boundaries.mjs. A later block
  // replaces an earlier `no-restricted-imports` rather than adding to it, so
  // each one repeats the server-package pattern above.
  ...[
    {
      part: 'storefront',
      forbidden: ['admin'],
      text: 'admin-text',
      entries: ['admin', 'machine', 'node'],
    },
    {
      part: 'admin',
      forbidden: ['storefront'],
      text: 'storefront-text',
      entries: ['storefront', 'machine', 'node'],
    },
    {
      part: 'platform',
      forbidden: ['storefront', 'admin'],
      entries: ['storefront', 'admin', 'machine', 'node'],
    },
    {
      part: 'core',
      forbidden: ['storefront', 'admin'],
      entries: ['storefront', 'admin', 'machine', 'node'],
    },
    ...TEXT_CUT_AREAS.map((area) => ({
      part: `core/${area}`,
      forbidden: ['storefront', 'admin'],
      text: 'storefront-text|admin-text',
      entries: ['storefront', 'admin', 'machine', 'node'],
    })),
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
      // Views: a later block replaces the earlier rule, so these
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
            message: `${part} code imports platform and core code, not ${forbidden.join(' or ')} code (see eslint.config.mjs).`,
          },
          {
            regex: `^@b2b-catalog-platform/shared/(${entries.join('|')})(/|$)`,
            message: `${part} code imports the shared library's ${part === 'platform' || part.startsWith('core') ? 'platform and core entries' : `platform, core and ${part} entries`}, not ${entries.join(' or ')} (see eslint.config.mjs).`,
          },
          ...(text
            ? [
                {
                  regex: `(^|/)config/(${text})(\\.\\w+)?$`,
                  message: part.startsWith('core/')
                    ? `${part} code reads the shared text only (see eslint.config.mjs).`
                    : `${part} code reads its own text and the shared text, not ${text} (see eslint.config.mjs).`,
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
        message: `${part} code imports platform and core code, not ${forbidden.join(' or ')} code, lazily or not (see eslint.config.mjs).`,
      },
      ...classFieldColours,
    ],
  };
}
