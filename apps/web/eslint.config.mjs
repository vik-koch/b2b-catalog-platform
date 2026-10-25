import nx from '@nx/eslint-plugin';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import baseConfig from '../../eslint.config.mjs';

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
    { part: 'storefront', forbidden: ['admin'], text: 'admin-text' },
    { part: 'admin', forbidden: ['storefront'], text: 'storefront-text' },
    { part: 'shared', forbidden: ['storefront', 'admin'] },
  ].flatMap(({ part, forbidden, text }) =>
    [false, true].map((spec) => ({
      files: [`src/app/${part}/**/*.${spec ? 'spec.ts' : 'ts'}`],
      ignores: spec ? [] : ['**/*.spec.ts'],
      rules: rulesFor(part, forbidden, spec ? undefined : text),
    })),
  ),
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];

function rulesFor(part, forbidden, text) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@nestjs/*'] },
          {
            regex: `(^|/)(${forbidden.join('|')})(/|$)`,
            message: `${part} code imports shared code, not ${forbidden.join(' or ')} code (see eslint.config.mjs).`,
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
        selector: `ImportExpression[source.value=/(^|\\/)(${forbidden.join('|')})(\\/|$)/]`,
        message: `${part} code imports shared code, not ${forbidden.join(' or ')} code, lazily or not (see eslint.config.mjs).`,
      },
    ],
  };
}
