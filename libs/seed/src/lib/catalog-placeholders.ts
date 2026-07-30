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
const CATEGORY_PX = 1000;

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

/** A category overlay image as a full + thumb pair (same motif, two sizes). */
export async function generateCategoryImage(
  mediaRoot: string,
  seed: string,
): Promise<CatalogImage> {
  const svgSeed = `cat-${seed}`;
  const [full, thumb] = await Promise.all([
    store(mediaRoot, placeholderSvg(svgSeed, CATEGORY_PX)),
    store(mediaRoot, placeholderSvg(svgSeed, THUMB_PX)),
  ]);
  return { full, thumb };
}
