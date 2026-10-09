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
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
