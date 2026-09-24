import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { CatalogImage, MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared';

/**
 * Demo placeholder images. Real product photography comes from the client;
 * until then the seed renders a simple coffee-bean motif on a warm gradient,
 * deterministically per seed string, so a re-seed produces byte-identical files
 * (same content hash → no duplicates). SVG is authored here but rasterised to
 * WebP with sharp, because the media store only accepts raster formats.
 */

// Match the catalog media profile (MEDIA_CATALOG_FULL_WIDTH / _THUMB_WIDTH) so
// the demo images are representative of what an admin upload produces.
const FULL_PX = 1000;
const THUMB_PX = 300;

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

/** A full + thumb pair for one product image. */
export async function generateProductImage(
  mediaRoot: string,
  seed: string,
): Promise<CatalogImage> {
  // Same seed for both — the thumb is a smaller copy of the full image, not a
  // different motif (hue and tilt derive from the seed).
  const [full, thumb] = await Promise.all([
    store(mediaRoot, placeholderSvg(seed, FULL_PX)),
    store(mediaRoot, placeholderSvg(seed, THUMB_PX)),
  ]);
  return { full, thumb };
}

/** `count` ordered gallery images for a product. */
export async function generateProductImages(
  mediaRoot: string,
  seed: string,
  count: number,
): Promise<CatalogImage[]> {
  const images: CatalogImage[] = [];
  for (let i = 1; i <= count; i++) {
    images.push(await generateProductImage(mediaRoot, `${seed}-${i}`));
  }
  return images;
}

/**
 * Category marks (FR-CAT-07). Unlike the product pictures above these are
 * drawn as a glyph on a tinted disc with nothing behind it — the mark sits on whatever
 * surface draws the category, so the file has to carry no background of its
 * own. One glyph per demo category, because a mark that varies only by hue
 * identifies nothing; a category the set does not name falls back to the bean.
 *
 * Demo art, deliberately plain: real marks come from the client.
 */
const MARK_FULL_PX = 1000;
const MARK_THUMB_PX = 300;

/** Drawn in a 100×100 box, kept inside the disc, stroked not filled. */
const markGlyphs: Record<string, string> = {
  'coffee-beans': `<g transform="translate(50 50) rotate(-20)"><ellipse rx="19" ry="27"/><path d="M0 -25 C -8 -10 -8 10 0 25 C 8 10 8 -10 0 -25"/></g>`,
  espresso: `<path d="M30 38h30v14a15 15 0 0 1-30 0z"/><path d="M60 41h8a7 7 0 0 1 0 13h-8"/><path d="M24 68h52"/>`,
  filter: `<path d="M28 32h44l-16 30h-12z"/><path d="M50 66v8"/>`,
  'single-origin': `<circle cx="50" cy="50" r="24"/><path d="M50 26c-12 8-12 40 0 48c12-8 12-40 0-48"/><path d="M26 50h48"/>`,
  tea: `<path d="M34 66C34 40 46 30 68 30C68 52 56 66 34 66z"/><path d="M40 62 62 38"/>`,
  equipment: `<circle cx="50" cy="50" r="9"/><circle cx="50" cy="50" r="20"/><g stroke-width="9"><path d="M50 26v-4M50 74v4M26 50h-4M74 50h4M33 33l-3-3M67 67l3 3M67 33l3-3M33 67l-3 3"/></g>`,
  grinders: `<path d="M34 28h32l-6 12H40z"/><rect x="38" y="40" width="24" height="20" rx="3"/><path d="M42 60v12h16V60"/>`,
  machines: `<rect x="26" y="24" width="40" height="26" rx="4"/><path d="M40 50h12v5H40z"/><path d="M38 76h16v-9a8 8 0 0 0-16 0z"/><path d="M66 34h8v14"/>`,
  accessories: `<path d="M44 26h12v20H44z"/><rect x="28" y="46" width="44" height="14" rx="4"/>`,
  'cold-brew': `<path d="M44 24h12v10l6 10v28a4 4 0 0 1-4 4H42a4 4 0 0 1-4-4V44l6-10z"/><path d="M38 56h24"/>`,
  syrups: `<rect x="38" y="40" width="24" height="34" rx="4"/><path d="M46 40v-8h8v8"/><path d="M50 32v-6h10"/>`,
  chocolate: `<rect x="30" y="34" width="40" height="32" rx="4"/><path d="M30 50h40M44 34v32M58 34v32"/>`,
  milk: `<path d="M36 42h28v32H36z"/><path d="M36 42V32l14-8 14 8v10"/><path d="M44 26h12"/>`,
  cups: `<path d="M26 36h20v18a10 10 0 0 1-20 0z"/><path d="M58 34h16l-3 32H61z"/><path d="M22 70h56"/>`,
  cleaning: `<rect x="34" y="50" width="32" height="12" rx="3"/><path d="M38 62v10M50 62v10M62 62v10M50 50V26"/>`,
  filters: `<path d="M30 44 50 34 70 44 50 54z"/><path d="M30 52 50 62 70 52M30 60 50 70 70 60"/>`,
  gifts: `<rect x="30" y="44" width="40" height="28" rx="3"/><path d="M30 54h40M50 44v28"/><path d="M50 44c-12-16-22-2 0 0c12-16 22-2 0 0"/>`,
};

function markSvg(sourceId: string, px: number): string {
  const hue = 16 + (hash(sourceId) % 30);
  const glyph = markGlyphs[sourceId] ?? markGlyphs['coffee-beans'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="hsl(${hue}, 40%, 80%)"/>
  <g fill="none" stroke="hsl(${hue}, 42%, 30%)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;
}

/** A category mark as a full + thumb pair, matching what the square upload
 * route stores (MEDIA_CATALOG_FULL_WIDTH / _THUMB_WIDTH, centre-cropped square
 * — these are already square). */
export async function generateCategoryMark(
  mediaRoot: string,
  sourceId: string,
): Promise<CatalogImage> {
  const [full, thumb] = await Promise.all([
    store(mediaRoot, markSvg(sourceId, MARK_FULL_PX)),
    store(mediaRoot, markSvg(sourceId, MARK_THUMB_PX)),
  ]);
  return { full, thumb };
}
