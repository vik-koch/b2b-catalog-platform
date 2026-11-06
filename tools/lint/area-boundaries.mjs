/**
 * The area and audience cut, held by eslint-plugin-boundaries.
 *
 * Every layer is cut into `<audience>/<area>/`, `core/<area>/` and `platform/`,
 * and an audience may keep its own `platform/` and a `shell/` that composes its
 * areas. A layer is a folder, not a type: the API and the web app never import
 * each other (Nx holds that), so the API's `admin/catalog` and the contracts'
 * `admin/catalog` are one element type, and each may import the other's level.
 *
 * What lies outside the cut, such as an app's root (`app/`, `main.ts`) or the
 * library's `node` entry, is unknown to the plugin and neither checked nor
 * refused.
 */
import boundaries from 'eslint-plugin-boundaries';

const ROOT = new URL('../..', import.meta.url).pathname;

export const LAYERS = ['apps/api/src', 'libs/shared/src', 'apps/web/src/app'];
export const AUDIENCES = ['storefront', 'admin', 'machine'];

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

const AREAS = Object.keys(AREA_EDGES);

/** The folders of the cut, relative to a layer, with the element type of each. */
export const FOLDERS = [
  { folder: 'platform', type: 'platform' },
  ...AUDIENCES.flatMap((audience) => [
    { folder: `${audience}/platform`, type: `${audience}:platform` },
    { folder: `${audience}/shell`, type: `${audience}:shell` },
  ]),
  ...AREAS.flatMap((area) => [
    { folder: `core/${area}`, type: `core:${area}` },
    ...AUDIENCES.map((audience) => ({
      folder: `${audience}/${area}`,
      type: `${audience}:${area}`,
    })),
  ]),
];

const reachable = (area) => [area, ...AREA_EDGES[area]];

/**
 * The library's `deployment` entry: the files both apps read, whole, put
 * together from every area's part. Only what lies outside the cut imports it,
 * and a spec or fixture, to set the scene.
 */
const DEPLOYMENT = {
  type: 'deployment',
  pattern: 'libs/shared/src/deployment',
  partialMatch: false,
};

/** What each type may import; anything not listed is refused. */
function allowed(type) {
  if (type === 'deployment') {
    return ['platform', ...AREAS.map((area) => `core:${area}`)];
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
      ...AREAS.flatMap((to) => [`${level}:${to}`, `core:${to}`]),
      ...below,
    ];
  }
  return [
    ...reachable(area).flatMap((to) => [`${level}:${to}`, `core:${to}`]),
    ...below,
  ];
}

const TYPES = ['deployment', ...new Set(FOLDERS.map(({ type }) => type))];

/** A spec or fixture may read a file whole, to set the scene. */
const SCENE = {
  from: { element: { fileInternalPath: ['**/*.spec.ts', '**/*.fixture.ts'] } },
  allow: { to: { element: { type: 'deployment' } } },
};

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
      'boundaries/elements': [
        DEPLOYMENT,
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
          // Code outside the cut is neither checked nor refused.
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
            .concat(SCENE),
        },
      ],
    },
  };
}
