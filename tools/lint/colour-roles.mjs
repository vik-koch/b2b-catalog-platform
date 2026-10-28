import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import {
  MatcherType,
  SelectorKind,
} from 'eslint-plugin-better-tailwindcss/types';

/*
 * The Tailwind and colour checks every web project shares, the app and the
 * UI library alike, so a class the library may not draw is refused the same
 * way in both.
 *
 * Colour patterns, as regex source. No `/` in any of them: the class-field
 * check below puts them in an esquery regex, which a `/` ends.
 *
 * ui.css switches Tailwind's palette off, so a palette class draws nothing;
 * these name the mistake where `no-unknown-classes` cannot see it (variant
 * maps, class fields). A role has no numbered step, so a colour class with
 * one is a palette's, whichever palette: no list to keep.
 */
const COLOR_UTILITY =
  '(?:bg|text|border(?:-[xytrblse])?|divide|ring(?:-offset)?|inset-ring|outline|decoration|accent|caret|fill|stroke|shadow|inset-shadow|drop-shadow|text-shadow|from|via|to)';
const STEP = '(?:50|[1-9]00|950)(?![\\w-])';
const PALETTE_CLASS = `!?${COLOR_UTILITY}-[a-z]+-${STEP}`;
/** A palette step reached by its variable, in an arbitrary value. */
const PALETTE_VARIABLE = `--(?:palette-|color-[a-z]+-${STEP})`;
/** A literal colour inside an arbitrary value; black and white, at any alpha, pass. */
const LITERAL_COLOR =
  '\\[[^\\]]*(?:#(?!(?:[fF]{3}|[fF]{6}|0{3}|0{6})[0-9a-fA-F]{0,2}(?![0-9a-fA-F]))[0-9a-fA-F]{3,8}' +
  '|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\((?!(?:0[\\s,_]+0[\\s,_]+0|255[\\s,_]+255[\\s,_]+255)(?![\\d.])))';
const COLOR_MESSAGE =
  'Not a colour role; use one from libs/ui/src/ui.css (ink, surface-strong, danger, …).';
/** Any of the above anywhere in a string of classes. */
const COLOR_IN_TEXT = `(?:(?:^|[\\s:])${PALETTE_CLASS}|${PALETTE_VARIABLE}|${LITERAL_COLOR})`;

/**
 * The Tailwind class checks against the stylesheet a project builds with.
 * `ignore` lists plain classes that stylesheet defines outside Tailwind.
 */
export function tailwindChecks(entryPoint, ignore = []) {
  return {
    // The same canonical-class check the Tailwind IntelliSense extension
    // shows, so CI and the editor agree. Wrapping is class-lines.mjs's; the
    // order is left as written. No `rootFontSize`: a rem value is never
    // rewritten as px.
    files: ['**/*.ts', '**/*.html'],
    // Inline templates lint as virtual files under their `.ts` path.
    ignores: ['**/*.spec.ts', '**/*.spec.ts/**'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: { 'better-tailwindcss': { entryPoint } },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      // Colour comes from the role tokens in ui.css, which a deployment's
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
              pattern: `(?:^|:)${PALETTE_CLASS}`,
              message: `A palette colour, switched off in ui.css. ${COLOR_MESSAGE}`,
            },
            {
              pattern: PALETTE_VARIABLE,
              message: `A palette step by its variable. ${COLOR_MESSAGE}`,
            },
            {
              pattern: LITERAL_COLOR,
              message: `A literal colour other than black or white. ${COLOR_MESSAGE}`,
            },
            {
              // Typography has a colour theme for every palette name.
              pattern: '(?:^|:)prose-(?!(?:sm|base|lg|xl|2xl|invert)$)[a-z]+$',
              message:
                'A Typography colour theme; `.prose` takes its colours from the roles in ui.css.',
            },
          ],
        },
      ],
      'better-tailwindcss/no-unknown-classes': ['error', { ignore }],
    },
  };
}

/**
 * `no-restricted-syntax` entries for a class string kept in a class field,
 * which the Tailwind plugin's selectors do not reach.
 */
export const classFieldColours = [
  'PropertyDefinition > Literal',
  'PropertyDefinition > TemplateLiteral > TemplateElement',
].map((node) => ({
  selector: `${node}[${node.endsWith('Literal') ? 'value' : 'value.raw'}=/${COLOR_IN_TEXT}/]`,
  message: COLOR_MESSAGE,
}));
