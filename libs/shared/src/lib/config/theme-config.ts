import * as z from 'zod';
import {
  contrastRatio,
  HEX_COLOR,
  MARK_CONTRAST,
  TEXT_CONTRAST,
} from './color-contrast';

/**
 * The roles each status colour has, every one of which a deployment sets when
 * it sets the colour at all: its shades only work as a set, and the check
 * below measures them as one. `base` is the bare name, text on the page.
 */
export const STATUS_ROLES = {
  danger: [
    'base',
    'hover',
    'press',
    'ink',
    'surface',
    'edge',
    'edgeStrong',
    'dot',
  ],
  warning: ['base', 'ink', 'surface', 'edge', 'dot'],
  success: ['base', 'ink', 'surface', 'dot'],
  info: ['ink', 'surface', 'edge', 'dot'],
} as const;

type StatusTone = keyof typeof STATUS_ROLES;

/**
 * The stylesheet's own page and recessed ground (stone-50 and stone-100), the
 * grounds a status colour is measured against when the deployment keeps them.
 */
const DEFAULT_GROUNDS = { surfaceSubtle: '#fafaf9', surface: '#f5f5f4' };

const statusColor = z
  .string()
  .regex(HEX_COLOR, 'a status colour is #rrggbb, the form the check measures');

function statusSchema<const R extends string>(roles: readonly R[]) {
  return z
    .object(
      Object.fromEntries(roles.map((role) => [role, statusColor])) as Record<
        R,
        typeof statusColor
      >,
    )
    .strict()
    .optional();
}

/**
 * The colours a deployment re-themes, each the role of the same name in
 * styles.css (`surfaceStrong` is `--color-surface-strong`). Only the brand is
 * required; every other key overrides the stylesheet's default, and a derived
 * role (a hover, a press) follows the role it derives from unless set itself.
 */
export const themeConfigSchema = z
  .object({
    primary: z.string(),
    /** The press; primary 15% toward black unless set. */
    primaryPress: z.string().optional(),
    /** Focus, on every control. */
    secondary: z.string(),
    /** Hover, on every control. */
    accent: z.string(),
    /** Accent on a ground too dark for it; accent 15% toward black unless set. */
    accentStrong: z.string().optional(),
    /** Body text. */
    ink: z.string().optional(),
    /** Everything quieter than body text: secondary copy, meta text, glyphs
     * that step back. */
    inkSubtle: z.string().optional(),
    /** The text of a control that cannot be used. */
    inkDisabled: z.string().optional(),
    /** Structural lines: card edges, dividers, table rules. */
    edge: z.string().optional(),
    /** Control edges: inputs, secondary buttons. */
    edgeStrong: z.string().optional(),
    /** Rows that repeat; `surface` unless set. */
    edgeSubtle: z.string().optional(),
    /** The page, and the level of the white things on it. */
    surfaceSubtle: z.string().optional(),
    /** A control hovered on the page level; `surface` unless set. */
    surfaceSubtleHover: z.string().optional(),
    /** And pressed; `surfaceStrong` unless set. */
    surfaceSubtlePress: z.string().optional(),
    /** A recessed ground: footer, notes, pills, a segmented track. */
    surface: z.string().optional(),
    /** A control hovered on `surface`; `surfaceStrong` unless set. */
    surfaceHover: z.string().optional(),
    /** And pressed; `edgeStrong` unless set. */
    surfacePress: z.string().optional(),
    /** One step further: a switch that is off. */
    surfaceStrong: z.string().optional(),
    /** A small fill that has to show on the page; a quarter step from
     * `surface` toward `surfaceStrong` unless set. */
    chip: z.string().optional(),
    /** A chip hovered; `surfaceStrong` unless set. */
    chipHover: z.string().optional(),
    /** Content still loading; `surfaceStrong` unless set. */
    skeleton: z.string().optional(),
    /** A refusal: an error, a refused field, a destructive control. */
    danger: statusSchema(STATUS_ROLES.danger),
    /** Something to weigh before going on, or work that waits. */
    warning: statusSchema(STATUS_ROLES.warning),
    /** A thing done. */
    success: statusSchema(STATUS_ROLES.success),
    /** A state worth pointing out. */
    info: statusSchema(STATUS_ROLES.info),
  })
  .strict()
  .superRefine((theme, ctx) => {
    const ground = (key: keyof typeof DEFAULT_GROUNDS) => {
      const set = theme[key];
      return set && HEX_COLOR.test(set) ? set : DEFAULT_GROUNDS[key];
    };
    for (const tone of Object.keys(STATUS_ROLES) as StatusTone[]) {
      const colors = theme[tone] as Record<string, string> | undefined;
      if (!colors) continue;
      for (const pair of statusPairs(tone, colors, ground)) {
        const ratio = contrastRatio(pair.fore, pair.back);
        if (ratio < pair.floor) {
          ctx.addIssue({
            code: 'custom',
            path: [tone, pair.role],
            message: `${pair.label} is ${ratio.toFixed(2)}:1; it needs ${pair.floor}:1`,
          });
        }
      }
    }
  });

interface Pair {
  role: string;
  label: string;
  fore: string;
  back: string;
  floor: number;
}

/** The pairs a status colour is drawn in, each held to its WCAG floor
 * (docs/design-language.md). */
function statusPairs(
  tone: StatusTone,
  colors: Record<string, string>,
  ground: (key: keyof typeof DEFAULT_GROUNDS) => string,
): Pair[] {
  const pairs: Pair[] = [
    {
      role: 'ink',
      label: `${tone}.ink on ${tone}.surface`,
      fore: colors['ink'],
      back: colors['surface'],
      floor: TEXT_CONTRAST,
    },
    {
      role: 'dot',
      label: `${tone}.dot on the page`,
      fore: colors['dot'],
      back: ground('surfaceSubtle'),
      floor: MARK_CONTRAST,
    },
  ];
  if (colors['base']) {
    pairs.push({
      role: 'base',
      label: `${tone}.base on the theme's surface`,
      fore: colors['base'],
      back: ground('surface'),
      floor: TEXT_CONTRAST,
    });
  }
  // Danger is also a fill, under a destructive button's white label.
  if (tone === 'danger') {
    for (const fill of ['base', 'hover', 'press']) {
      pairs.push({
        role: fill,
        label: `white on danger.${fill}`,
        fore: '#ffffff',
        back: colors[fill],
        floor: TEXT_CONTRAST,
      });
    }
  }
  return pairs;
}
