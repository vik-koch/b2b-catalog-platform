import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { CatalogImage } from '@b2b-catalog-platform/shared/core/catalog';
import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared/platform';

/**
 * Demo placeholder images. Real product photography comes from the client;
 * until then the seed renders a simple coffee-bean motif on a warm gradient —
 * or, for a bundle that names its own (`catalog.drawn`), its icons on its hue —
 * deterministically per seed string, so a re-seed produces byte-identical files
 * (same content hash → no duplicates). SVG is authored here but rasterised to
 * WebP with sharp, because the media store only accepts raster formats.
 */

// Match the catalog media profile (MEDIA_CATALOG_FULL_WIDTH / _THUMB_WIDTH) so
// the demo images are representative of what an admin upload produces.
export const FULL_PX = 1000;
export const THUMB_PX = 300;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A warm coffee-toned bean on a gradient; hue and tilt vary by seed. */
function placeholderSvg(seed: string, px: number): string {
  const hue = 16 + (hash(seed) % 30); // warm browns/oranges
  const rot = -45 + (hash(seed + '·') % 50);
  const light = `hsl(${hue}, 44%, 44%)`;
  const dark = `hsl(${hue}, 46%, 23%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="translate(50 52) rotate(${rot})" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="3">
    <ellipse cx="0" cy="0" rx="21" ry="31"/>
    <path d="M0 -29 C -9 -12 -9 12 0 29 C 9 12 9 -12 0 -29"/>
  </g>
</svg>`;
}

/** Rasterise, content-address, and write once — mirrors LocalMediaStore.put. */
async function store(mediaRoot: string, svg: string): Promise<string> {
  const bytes = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  return storeImage(mediaRoot, bytes);
}

/** Content-address WebP bytes and write them once; returns the media URL. */
export async function storeImage(
  mediaRoot: string,
  bytes: Buffer,
): Promise<string> {
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const filename = `${id}.webp`;
  const path = join(mediaRoot, filename);
  try {
    await access(path);
  } catch {
    await mkdir(mediaRoot, { recursive: true });
    await writeFile(path, bytes);
  }
  return `${MEDIA_URL_PREFIX}/${filename}`;
}

/**
 * A bundle's own way of drawing (`catalog.drawn`): its hue, and the icon a
 * picture shows — the drawing inside a 24-unit stroked icon's `<svg>`.
 */
export interface DrawnArt {
  hue: number;
  icon: string;
}

/** `icon` stroked in `ink`, `size` units square, centred on `cx`/`cy`. */
function iconAt(
  icon: string,
  cx: number,
  cy: number,
  size: number,
  ink: string,
  width = 2,
): string {
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${icon.replaceAll('currentColor', ink)}</g>`;
}

/** The icon, faint, on a gradient around the bundle's hue. */
function drawnSvg(art: DrawnArt, seed: string, px: number): string {
  const hue = art.hue - 12 + (hash(seed) % 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 45%, 62%)"/>
      <stop offset="1" stop-color="hsl(${hue}, 50%, 36%)"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#g)"/>
  ${iconAt(art.icon, 50, 50, 44, 'rgba(255,255,255,0.35)', 1.5)}
</svg>`;
}

/** A full + thumb pair for one product image. */
export async function generateProductImage(
  mediaRoot: string,
  seed: string,
  art?: DrawnArt,
): Promise<CatalogImage> {
  // Same seed for both — the thumb is a smaller copy of the full image, not a
  // different motif (hue and tilt derive from the seed).
  const draw = (px: number) =>
    art ? drawnSvg(art, seed, px) : placeholderSvg(seed, px);
  const [full, thumb] = await Promise.all([
    store(mediaRoot, draw(FULL_PX)),
    store(mediaRoot, draw(THUMB_PX)),
  ]);
  return { full, thumb };
}

/** A cup and saucer in one glaze, on a plain warm ground; `angle` tilts it, so
 * two pictures of one variant are two pictures rather than one file. */
function cupSvg(
  glaze: string,
  x: number,
  y: number,
  scale: number,
  angle: number,
): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" stroke="rgba(0,0,0,0.18)" stroke-width="1.2">
    <ellipse cx="0" cy="17" rx="27" ry="6" fill="${glaze}"/>
    <path d="M-17 -12h34v14a17 17 0 0 1-34 0z" fill="${glaze}"/>
    <path d="M17 -7h5a7 7 0 0 1 0 14h-5" fill="none" stroke="${glaze}" stroke-width="3.5"/>
  </g>`;
}

/** One glaze large, or the range in rows of two, so no saucer overlaps the
 * next and no handle runs off the edge. */
function glazeSvg(glazes: readonly string[], seed: string, px: number): string {
  const angle = -8 + (hash(seed) % 16);
  const rows = Math.ceil(glazes.length / 2);
  const cups =
    glazes.length === 1
      ? cupSvg(glazes[0], 50, 56, 1.3, angle)
      : glazes
          .map((glaze, i) => {
            const row = Math.floor(i / 2);
            const inRow = Math.min(2, glazes.length - row * 2);
            const x = inRow === 1 ? 50 : i % 2 === 0 ? 29 : 71;
            const y = rows === 1 ? 56 : 34 + row * 34;
            return cupSvg(glaze, x, y, 0.62, 0);
          })
          .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="hsl(34, 30%, 90%)"/>
  <rect y="74" width="100" height="26" fill="hsl(34, 22%, 82%)"/>
  ${cups}
</svg>`;
}

/** The bundle's counterpart to the cups: a swatch in each colour carrying
 * the icon, laid out as the cups are. */
function swatchSvg(
  art: DrawnArt,
  colours: readonly string[],
  px: number,
): string {
  const ink = `hsl(${art.hue}, 40%, 24%)`;
  const swatch = (colour: string, x: number, y: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>${iconAt(art.icon, x, y, r, ink, 1.8)}`;
  const rows = Math.ceil(colours.length / 2);
  const swatches =
    colours.length === 1
      ? swatch(colours[0], 50, 48, 30)
      : colours
          .map((colour, i) => {
            const row = Math.floor(i / 2);
            const inRow = Math.min(2, colours.length - row * 2);
            const x = inRow === 1 ? 50 : i % 2 === 0 ? 30 : 70;
            const y = rows === 1 ? 48 : 50 - ((rows - 1) * 26) / 2 + row * 26;
            return swatch(colour, x, y, 11);
          })
          .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="hsl(${art.hue}, 30%, 94%)"/>
  ${swatches}
</svg>`;
}

/**
 * A picture of glazed cups as a full + thumb pair: one glaze is a variant's
 * picture (FR-CAT-11), several side by side the picture of the whole range.
 * With the bundle's own art, swatches in the variants' colours instead.
 */
export async function generateGlazeImage(
  mediaRoot: string,
  seed: string,
  glazes: readonly string[],
  art?: DrawnArt,
): Promise<CatalogImage> {
  const draw = (px: number) =>
    art ? swatchSvg(art, glazes, px) : glazeSvg(glazes, seed, px);
  const [full, thumb] = await Promise.all([
    store(mediaRoot, draw(FULL_PX)),
    store(mediaRoot, draw(THUMB_PX)),
  ]);
  return { full, thumb };
}

/**
 * Category marks (FR-CAT-07): the bundle's icon on a tinted disc, with nothing
 * behind it — the mark sits on whatever surface draws the category, so the file
 * has to carry no background of its own. The chip draws the file edge to edge,
 * so the margin is in the file: the disc takes three quarters of the square
 * (or the bundle's `markSize`), centred, and the icon half of the disc. The
 * tint varies by category, the icon is what tells them apart.
 */
const MARK_FULL_PX = 1000;
const MARK_THUMB_PX = 300;

/** `icon` is a 24-unit stroked icon's drawing, as the bundle's marks are.
 * `baseHue` is the bundle's own; absent, the warm browns. */
function markSvg(
  sourceId: string,
  icon: string,
  px: number,
  baseHue?: number,
  size = 0.75,
): string {
  const hue =
    baseHue === undefined
      ? 16 + (hash(sourceId) % 30)
      : baseHue - 15 + (hash(sourceId) % 30);
  const ink = `hsl(${hue}, 42%, 30%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <g transform="translate(${50 - size * 50} ${50 - size * 50}) scale(${size})">
    <circle cx="50" cy="50" r="50" fill="hsl(${hue}, 40%, 80%)"/>
    <g transform="translate(25 25) scale(${50 / 24})" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.replaceAll('currentColor', ink)}</g>
  </g>
</svg>`;
}

/** A category mark as a full + thumb pair, matching what the square upload
 * route stores (MEDIA_CATALOG_FULL_WIDTH / _THUMB_WIDTH, centre-cropped square
 * — these are already square). */
export async function generateCategoryMark(
  mediaRoot: string,
  sourceId: string,
  icon: string,
  baseHue?: number,
  size?: number,
): Promise<CatalogImage> {
  const [full, thumb] = await Promise.all([
    store(mediaRoot, markSvg(sourceId, icon, MARK_FULL_PX, baseHue, size)),
    store(mediaRoot, markSvg(sourceId, icon, MARK_THUMB_PX, baseHue, size)),
  ]);
  return { full, thumb };
}
