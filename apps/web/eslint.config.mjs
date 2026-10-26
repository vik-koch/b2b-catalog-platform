import nx from '@nx/eslint-plugin';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import {
  MatcherType,
  SelectorKind,
} from 'eslint-plugin-better-tailwindcss/types';
import baseConfig from '../../eslint.config.mjs';

/** Tailwind's colour palettes, none of which a template may name. */
const PALETTE = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];
const PALETTE_MESSAGE =
  'A Tailwind palette colour; use a colour role from styles.css (ink, surface-strong, danger, …).';
/** A palette class anywhere in a string of classes. No `/`: it ends an esquery regex. */
const PALETTE_IN_TEXT = `(^|[\\s:])!?-?[a-z-]+-(${PALETTE.join('|')})-\\d`;

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    // The same canonical-class check the Tailwind IntelliSense extension
    // shows, so CI and the editor agree. Ordering and wrapping stay with
    // whoever formats the file. No `rootFontSize`: a rem value is never
    // rewritten as px.
    files: ['**/*.ts', '**/*.html'],
    // Inline templates lint as virtual files under their `.ts` path.
    ignores: ['**/*.spec.ts', '**/*.spec.ts/**'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: {
      'better-tailwindcss': {
        entryPoint: `${import.meta.dirname}/src/styles.css`,
      },
    },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      // Colour comes from the role tokens in styles.css, which a deployment's
      // theme reaches; a palette class or a literal colour draws the same in
      // every deployment and slips past the contrast the tokens were picked for.
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          // Every string, not only the places the plugin knows hold classes:
          // the variant maps and computed class strings are named freely, and
          // a palette name cannot turn up in a string that is not a class.
          selectors: [
            ...getDefaultSelectors(),
            {
              kind: SelectorKind.Variable,
              name: '.*',
              match: [
                { type: MatcherType.String },
                { type: MatcherType.ObjectValue },
              ],
            },
            {
              kind: SelectorKind.Callee,
              name: '.*',
              match: [
                { type: MatcherType.String },
                { type: MatcherType.ObjectValue },
                {
                  type: MatcherType.AnonymousFunctionReturn,
                  match: [{ type: MatcherType.String }],
                },
              ],
            },
          ],
          restrict: [
            {
              pattern: `(?:^|:)!?-?[a-z-]+-(?:${PALETTE.join('|')})-\\d+(?:/\\d+)?!?$`,
              message: PALETTE_MESSAGE,
            },
            {
              pattern: '(?:^|:)prose-(?:slate|gray|zinc|neutral|stone)$',
              message:
                'A Typography colour theme; `.prose` takes its colours from the roles in styles.css.',
            },
            {
              pattern:
                '(?:^|:)!?[a-z-]+-\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|color:)',
              message:
                'A literal colour; use a colour role from styles.css instead.',
            },
          ],
        },
      ],
      'better-tailwindcss/no-unknown-classes': [
        'error',
        {
          ignore: [
            // Plain classes styles.css defines outside Tailwind.
            '^text-stable$',
            '^logo-mark$',
            '^elsewhere-mark$',
            '^listing-held$',
            '^cart-(count|total)$',
            // The argument of a `[class.text-right]` comparison reads as one.
            '^right$',
          ],
        },
      ],
    },
  },
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
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@nestjs/*'],
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
    ];
  }),
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];

function rulesFor(part, forbidden, entries, text) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@nestjs/*'] },
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
      // A class string kept in a class field, which the Tailwind plugin's
      // selectors do not reach.
      ...[
        'PropertyDefinition > Literal',
        'PropertyDefinition > TemplateLiteral > TemplateElement',
      ].map((node) => ({
        selector: `${node}[${node.endsWith('Literal') ? 'value' : 'value.raw'}=/${PALETTE_IN_TEXT}/]`,
        message: PALETTE_MESSAGE,
      })),
    ],
  };
}
