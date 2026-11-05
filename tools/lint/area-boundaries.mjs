/**
 * The area and audience cut, held by eslint-plugin-boundaries.
 *
 * Every layer is cut into `<audience>/<area>/`, `core/<area>/` and `platform/`,
 * and an audience may keep its own `platform/` and a `shell/` that composes its
 * areas. A layer is a folder, not a type: the API and the web app never import
 * each other (Nx holds that), so the API's `admin/catalog` and the contracts'
 * `admin/catalog` are one element type, and each may import the other's level.
 *
 * Only the areas in `ENABLED` are classified. Everything else is unknown to the
 * plugin and neither checked nor refused, so an area moves without the others.
 */
import boundaries from 'eslint-plugin-boundaries';

const ROOT = new URL('../..', import.meta.url).pathname;

const LAYERS = ['apps/api/src', 'libs/shared/src', 'apps/web/src/app'];
const AUDIENCES = ['storefront', 'admin', 'machine'];

/** What an area may import besides itself: the domain's direction, never both ways. */
export const AREA_EDGES = {
  catalog: [],
  accounts: ['catalog', 'site'],
  site: [],
  ordering: ['catalog', 'accounts', 'site'],
  exchange: ['catalog', 'accounts', 'ordering'],
  work: ['catalog', 'accounts', 'ordering', 'exchange'],
  retention: ['ordering', 'site'],
};

/** The areas already moved; the rest join as they move. */
const ENABLED = [
  'catalog',
  'site',
  'accounts',
  'ordering',
  'exchange',
  'work',
  'retention',
];

/** The folders of the cut, relative to a layer, with the element type of each. */
const FOLDERS = [
  { folder: 'platform', type: 'platform' },
  ...AUDIENCES.flatMap((audience) => [
    { folder: `${audience}/platform`, type: `${audience}:platform` },
    { folder: `${audience}/shell`, type: `${audience}:shell` },
  ]),
  ...ENABLED.flatMap((area) => [
    { folder: `core/${area}`, type: `core:${area}` },
    ...AUDIENCES.map((audience) => ({
      folder: `${audience}/${area}`,
      type: `${audience}:${area}`,
    })),
  ]),
];

const reachable = (area) =>
  [area, ...AREA_EDGES[area]].filter((to) => ENABLED.includes(to));

/** What each type may import; anything not listed is refused. */
function allowed(type) {
  const types = allowedTypes(type);
  return types.includes('platform') ? [...types, 'platform:composing'] : types;
}

function allowedTypes(type) {
  if (type === 'platform:composing') {
    return ['platform', ...ENABLED.map((area) => `core:${area}`)];
  }
  if (type === 'platform') return ['platform'];
  const [level, area] = type.split(':');
  if (level === 'core') {
    return [...reachable(area).map((to) => `core:${to}`), 'platform'];
  }
  const below = [`${level}:platform`, 'platform'];
  if (area === 'platform') return below;
  if (area === 'shell') {
    return [
      `${level}:shell`,
      ...ENABLED.flatMap((to) => [`${level}:${to}`, `core:${to}`]),
      ...below,
    ];
  }
  return [
    ...reachable(area).flatMap((to) => [`${level}:${to}`, `core:${to}`]),
    ...below,
  ];
}

/**
 * An exception to "platform imports no area": the deployment config and
 * the texts are composed of every area's part. Imported like platform.
 */
const COMPOSING = [
  'libs/shared/src/platform/config',
  'apps/api/src/platform/config',
];

/**
 * The other exception, for foreign keys only: every area's tables, and
 * platform's, record who changed a row, so a schema module may reference
 * `users`. A query still reads tables only along the table.
 */
const ACTOR_REFERENCES = {
  from: {
    element: {
      types: { anyOf: ['platform', ...ENABLED.map((area) => `core:${area}`)] },
      fileInternalPath: ['*-schema.ts', 'db/schema.ts'],
    },
  },
  allow: {
    to: {
      element: {
        type: 'core:accounts',
        fileInternalPath: 'accounts-schema.ts',
      },
    },
  },
};

const TYPES = [
  'platform:composing',
  ...new Set(FOLDERS.map(({ type }) => type)),
];

/**
 * The lint block for the layer under `source` (`src`, `src/app`). Element
 * patterns are matched from the workspace root, so the settings name every
 * layer; `files` is relative to the project's own config.
 */
export function areaBoundaries(source) {
  return {
    files: FOLDERS.map(({ folder }) => `${source}/${folder}/**/*.ts`),
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': ROOT,
      'boundaries/legacy-templates': false,
      // First match wins, so the composing folders come before `platform`.
      'boundaries/elements': [
        ...COMPOSING.map((pattern) => ({
          type: 'platform:composing',
          pattern,
          partialMatch: false,
        })),
        ...LAYERS.flatMap((path) =>
          FOLDERS.map(({ folder, type }) => ({
            type,
            pattern: `${path}/${folder}`,
            partialMatch: false,
          })),
        ),
      ],
      'import/resolver': {
        typescript: { project: `${ROOT}tsconfig.base.json` },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          // Unknown code (an area not yet moved) is neither checked nor refused.
          default: 'allow',
          policies: TYPES.map((type) => ({
            type,
            refused: TYPES.filter((to) => !allowed(type).includes(to)),
          }))
            .filter(({ refused }) => refused.length > 0)
            .map(({ type, refused }) => ({
              from: { element: { type } },
              disallow: { to: { element: { types: { anyOf: refused } } } },
              message: `${type} may import ${allowed(type).join(', ')} (ADR 0073, tools/lint/area-boundaries.mjs).`,
            }))
            // Last, as the last matching policy wins.
            .concat(ACTOR_REFERENCES),
        },
      ],
    },
  };
}
