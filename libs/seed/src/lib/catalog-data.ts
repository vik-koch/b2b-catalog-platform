import { ProductAttribute } from '@b2b-catalog-platform/shared';

/**
 * Demo catalog for the fictional Hamburg coffee roastery. Authored as a full
 * tree (file-owned name/price/category plus the admin overlay: description,
 * attributes, images) — the seed writes rows directly, so it sidesteps the
 * import's flat-category limitation, which is the FR-ADM edit story.
 */

export interface CategorySeed {
  sourceId: string;
  slug: string;
  name: string;
  /** Parent's sourceId, or null for a top-level category. */
  parentKey: string | null;
  sortOrder: number;
  hasImage: boolean;
}

export interface ProductSeed {
  sourceId: string;
  slug: string;
  name: string;
  /** The leaf category's sourceId. */
  categoryKey: string;
  priceMinor: number;
  descriptionHtml: string;
  attributes: ProductAttribute[];
  imageCount: number;
  /** Units of sale. Absent means the product is sold by the piece. */
  packaging?: ProductPackagingSeed;
  /** Pieces on hand. Absent means the stock is not tracked, which shows the
   * customer nothing at all. */
  stockPieces?: number;
  /** A collective item whose cart line may name the variant wanted. */
  lineNoteEnabled?: boolean;
  lineNotePrompt?: string;
}

/**
 * The packaging cases worth having in a demo catalog, including the awkward
 * ones: a price that covers a whole pack, and a minimum above the pack size.
 * `priceBasisPieces` must divide `minPieceQty` and `piecesPerPack`.
 */
export interface ProductPackagingSeed {
  piecesPerPack?: number;
  packsPerBox?: number;
  minPieceQty?: number;
  priceBasisPieces?: number;
  boxVolume?: string;
  boxWeight?: string;
  /** How many boxes ship; informational, and 1 for almost every product. */
  boxCount?: number;
}

let order = 0;
const top = (
  sourceId: string,
  name: string,
  hasImage = true,
): CategorySeed => ({
  sourceId,
  slug: sourceId,
  name,
  parentKey: null,
  sortOrder: order++,
  hasImage,
});
const sub = (
  sourceId: string,
  name: string,
  parentKey: string,
  hasImage = true,
): CategorySeed => ({
  sourceId,
  slug: sourceId,
  name,
  parentKey,
  sortOrder: order++,
  hasImage,
});

// 12 top-level categories; subcategories only on Coffee Beans and Equipment.
export const categorySeeds: CategorySeed[] = [
  top('coffee-beans', 'Coffee Beans'),
  sub('espresso', 'Espresso Roasts', 'coffee-beans'),
  sub('filter', 'Filter Roasts', 'coffee-beans'),
  sub('decaf', 'Decaf', 'coffee-beans', false),
  sub('single-origin', 'Single Origin', 'coffee-beans'),

  top('tea', 'Tea'),

  top('equipment', 'Equipment'),
  sub('grinders', 'Grinders', 'equipment'),
  sub('machines', 'Espresso Machines', 'equipment'),

  top('accessories', 'Accessories'),
  top('cold-brew', 'Cold Brew & RTD'),
  top('syrups', 'Syrups & Flavours'),
  top('chocolate', 'Chocolate & Cocoa'),
  top('milk', 'Milk & Alternatives'),
  top('cups', 'Cups & Glassware'),
  top('cleaning', 'Cleaning & Care'),
  top('filters', 'Filters & Papers'),
  top('gifts', 'Gift Sets'),
];

/**
 * A filterable attribute (FR-ATTR-01), matched to product rows by name. The
 * demo declares only some of the keys products carry — "Tasting notes" stays
 * freetext, which is what an undeclared attribute is supposed to look like.
 */
export interface AttributeDefinitionSeed {
  name: string;
  slug: string;
  type: 'text' | 'number';
  /** Number attributes only: the unit belongs here, never in the value. */
  unit: string | null;
}

export const attributeDefinitionSeeds: AttributeDefinitionSeed[] = [
  { name: 'Origin', slug: 'origin', type: 'text', unit: null },
  { name: 'Roast level', slug: 'roast-level', type: 'text', unit: null },
  { name: 'Process', slug: 'process', type: 'text', unit: null },
  { name: 'Type', slug: 'type', type: 'text', unit: null },
  // Stored unit-free ("1000"), so the values sort numerically and "1 kg" and
  // "1000 g" cannot become two facets. One tea's weight reads "ca. 250" and
  // demonstrates the unparseable case.
  { name: 'Net weight', slug: 'net-weight', type: 'number', unit: 'g' },
  { name: 'Volume', slug: 'volume', type: 'number', unit: 'ml' },
];

const beanAttributes = (
  origin: string,
  roast: string,
  process: string,
  notes: string,
): ProductAttribute[] => [
  { key: 'Origin', value: origin },
  { key: 'Roast level', value: roast },
  { key: 'Process', value: process },
  { key: 'Tasting notes', value: notes },
  { key: 'Net weight', value: '1000' },
];

const beanDescription = (name: string, notes: string): string =>
  `<p>${name} is a wholesale specialty lot roasted to order in Hamburg.</p>` +
  `<p>Expect <strong>${notes}</strong> in the cup. Supplied in 1&nbsp;kg bags, ` +
  `whole bean, with a roast date on every bag, and <em>available on standing ` +
  `order</em>.</p>`;

// 26 espresso roasts so the category paginates (page size is 24). The first
// few carry several images to exercise the tile slider and the detail gallery.
const ESPRESSO = [
  ['Hafen Espresso', 'Brazil / India blend', 'dark chocolate and hazelnut'],
  ['Kontor Classic', 'Central America blend', 'caramel and toasted almond'],
  ['Notturno Ristretto', 'Indonesia', 'cocoa and dried fig'],
  ["Crema d'Oro", 'Colombia', 'brown sugar and orange peel'],
  ['Speicher Blend', 'Ethiopia / Brazil', 'red apple and praline'],
  ['Elbe Dark', 'Brazil', 'dark chocolate and walnut'],
  ['Roastery No. 7', 'Guatemala', 'baking spice and cocoa'],
  ['Morgengruss', 'Honduras', 'milk chocolate and almond'],
  ['Nordic Pull', 'Kenya / Brazil', 'blackcurrant and molasses'],
  ['Alster Reserve', 'Peru', 'toffee and hazelnut'],
  ['Kaicafé Bar', 'Vietnam / Brazil', 'dark cocoa and cane sugar'],
  ['Espresso Dolce', 'Colombia / Brazil', 'caramel and milk chocolate'],
  ['Torrefatto Scuro', 'India', 'clove and dark chocolate'],
  ['Barista Reserve', 'Ethiopia', 'stone fruit and praline'],
  ['Doppio Intenso', 'Uganda', 'molasses and roasted nut'],
  ['Levante Blend', 'Yemen / Ethiopia', 'dried fruit and spice'],
  ['Fährmann', 'Brazil / Peru', 'peanut and cocoa'],
  ['Signature Ristretto', 'Guatemala / Brazil', 'cocoa and cherry'],
  ['ContADORA', 'Panama', 'red fruit and caramel'],
  ['Nero Assoluto', 'India / Uganda', 'bitter chocolate and pepper'],
  ['Warehouse Espresso', 'Blend', 'chocolate and brown sugar'],
  ['Fortezza', 'Brazil', 'roasted almond and cocoa'],
  ['Miscela Verde', 'Colombia', 'orange and toffee'],
  ['Kontor Reserve', 'Ethiopia / Colombia', 'floral and caramel'],
  ['Aroma Nero', 'Honduras / Brazil', 'chocolate and hazelnut'],
  ['Ultimo Espresso', 'Blend', 'cocoa, nut and a syrupy body'],
];

/**
 * Espresso is the packaged line, and deliberately not uniform — the display and
 * the arithmetic both need the awkward cases visible in the demo:
 *
 * - most: six 250 g bags to a pack, four packs to a box, priced per piece
 * - every 4th: priced per **pack** (a price that does not divide evenly into a
 *   per-piece figure, so the page shows three decimals)
 * - every 5th: a minimum order well above the pack size
 * - every 6th: shipped as two boxes rather than one
 * - every 7th: packs but no box
 * - every 8th: sold by the single bag, so the pack is opened and a piece
 *   quantity moves by one rather than by six
 */
const espressoPackaging = (i: number): ProductPackagingSeed | undefined => {
  if (i % 7 === 6) return { piecesPerPack: 6, minPieceQty: 6 };
  const base: ProductPackagingSeed = {
    piecesPerPack: 6,
    packsPerBox: 4,
    minPieceQty: i % 5 === 4 ? 24 : i % 8 === 2 ? 1 : 6,
    boxVolume: '0.072',
    boxWeight: '6.400',
    // The rare case: a product that ships split across two boxes.
    ...(i % 6 === 5 ? { boxCount: 2 } : {}),
  };
  return i % 4 === 3 ? { ...base, priceBasisPieces: 6 } : base;
};

const espressoProducts: ProductSeed[] = ESPRESSO.map(
  ([name, origin, notes], i) => ({
    sourceId: `ESP-${String(i + 1).padStart(3, '0')}`,
    slug: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, ''),
    name,
    categoryKey: 'espresso',
    // A pack-priced product stores the price of six bags, not one.
    priceMinor: i % 4 === 3 ? 9990 + i * 40 : 1690 + i * 40,
    descriptionHtml: beanDescription(name, notes),
    attributes: beanAttributes(origin, 'Medium-dark', 'Mixed', notes),
    imageCount: i < 6 ? 3 : 1,
    packaging: espressoPackaging(i),
  }),
);

const p = (
  sourceId: string,
  slug: string,
  name: string,
  categoryKey: string,
  priceMinor: number,
  descriptionHtml: string,
  attributes: ProductAttribute[],
  imageCount = 2,
): ProductSeed => ({
  sourceId,
  slug,
  name,
  categoryKey,
  priceMinor,
  descriptionHtml,
  attributes,
  imageCount,
});

const allProducts: ProductSeed[] = [
  ...espressoProducts,

  p(
    'FIL-001',
    'yirgacheffe-filter',
    'Yirgacheffe Filter',
    'filter',
    2290,
    beanDescription('Yirgacheffe Filter', 'jasmine, bergamot and stone fruit'),
    beanAttributes('Ethiopia', 'Light', 'Washed', 'jasmine and bergamot'),
    3,
  ),
  p(
    'FIL-002',
    'huila-filter',
    'Huila Filter',
    'filter',
    2190,
    beanDescription('Huila Filter', 'red berries and panela'),
    beanAttributes(
      'Colombia',
      'Light-medium',
      'Washed',
      'red berries and panela',
    ),
  ),
  p(
    'FIL-003',
    'kenya-ab-filter',
    'Kenya AB Filter',
    'filter',
    2490,
    beanDescription('Kenya AB Filter', 'blackcurrant and a juicy acidity'),
    beanAttributes('Kenya', 'Light', 'Washed', 'blackcurrant'),
  ),

  p(
    'DEC-001',
    'ohne-decaf',
    'Ohne Decaf',
    'decaf',
    1990,
    beanDescription('Ohne Decaf', 'milk chocolate and roasted nut'),
    beanAttributes('Colombia', 'Medium', 'Sugarcane EA', 'milk chocolate'),
  ),
  p(
    'DEC-002',
    'nacht-decaf',
    'Nacht Decaf Espresso',
    'decaf',
    2090,
    beanDescription(
      'Nacht Decaf Espresso',
      'cocoa and caramel, fully decaffeinated',
    ),
    beanAttributes('Brazil', 'Medium-dark', 'Swiss Water', 'cocoa and caramel'),
  ),

  p(
    'SO-001',
    'gesha-limited',
    'Gesha Limited Lot',
    'single-origin',
    3890,
    beanDescription('Gesha Limited Lot', 'jasmine, peach and bergamot'),
    beanAttributes('Panama', 'Light', 'Washed', 'jasmine and peach'),
    3,
  ),
  p(
    'SO-002',
    'sidamo-natural',
    'Sidamo Natural',
    'single-origin',
    2590,
    beanDescription('Sidamo Natural', 'blueberry and dark chocolate'),
    beanAttributes('Ethiopia', 'Light-medium', 'Natural', 'blueberry'),
  ),
  p(
    'SO-003',
    'antigua-single',
    'Antigua Single Origin',
    'single-origin',
    2390,
    beanDescription('Antigua Single Origin', 'cocoa, orange and caramel'),
    beanAttributes('Guatemala', 'Medium', 'Washed', 'cocoa and orange'),
  ),

  p(
    'TEA-001',
    'ostfriesen-broken',
    'Ostfriesen Broken',
    'tea',
    1290,
    '<p>A robust Assam broken-leaf blend, <strong>malty and strong</strong> — the classic base for a hearty cup.</p>',
    [
      { key: 'Type', value: 'Black tea' },
      { key: 'Origin', value: 'Assam' },
      { key: 'Net weight', value: '500' },
    ],
  ),
  p(
    'TEA-002',
    'sencha-green',
    'Sencha Green',
    'tea',
    1490,
    '<p>Grassy, fresh Japanese sencha with a gentle sweetness.</p>',
    [
      { key: 'Type', value: 'Green tea' },
      { key: 'Origin', value: 'Japan' },
      { key: 'Net weight', value: '250' },
    ],
  ),
  p(
    'TEA-003',
    'pfefferminz',
    'Pfefferminz Herbal',
    'tea',
    990,
    '<p>Pure peppermint leaf, caffeine-free and bright.</p>',
    [
      { key: 'Type', value: 'Herbal' },
      { key: 'Origin', value: 'Germany' },
      // Deliberately unparseable: it is stored and shown exactly as typed, and
      // simply drops out of the Net weight filter (FR-ATTR-03).
      { key: 'Net weight', value: 'ca. 250' },
    ],
  ),

  p(
    'GRD-001',
    'kontor-grind-one',
    'Kontor Grind One',
    'grinders',
    34900,
    '<p>A flat-burr shop grinder for a busy counter. Stepless adjustment, quiet motor.</p>',
    [
      { key: 'Burr', value: '64 mm flat' },
      { key: 'Adjustment', value: 'Stepless' },
      { key: 'Hopper', value: '1.2 kg' },
    ],
    3,
  ),
  p(
    'GRD-002',
    'kontor-hand-grinder',
    'Kontor Hand Grinder',
    'grinders',
    8900,
    '<p>A precise hand grinder for filter brewing on the go.</p>',
    [
      { key: 'Burr', value: '38 mm conical' },
      { key: 'Body', value: 'Anodised aluminium' },
    ],
  ),

  p(
    'MCH-001',
    'hafen-dual-boiler',
    'Hafen Dual Boiler',
    'machines',
    189000,
    '<p>A dual-boiler espresso machine for simultaneous brewing and steaming, PID controlled.</p>',
    [
      { key: 'Boilers', value: 'Dual' },
      { key: 'Control', value: 'PID' },
      { key: 'Portafilter', value: '58 mm' },
    ],
    3,
  ),

  p(
    'ACC-001',
    'tamper-58',
    'Precision Tamper 58 mm',
    'accessories',
    4500,
    '<p>A weighted 58&nbsp;mm stainless tamper with a walnut handle.</p>',
    [
      { key: 'Diameter', value: '58 mm' },
      { key: 'Material', value: 'Stainless / walnut' },
    ],
  ),
  p(
    'ACC-002',
    'milk-pitcher-05',
    'Milk Pitcher 0.5 L',
    'accessories',
    2900,
    '<p>A 0.5&nbsp;litre stainless steaming pitcher with a sharp spout for latte art.</p>',
    [
      { key: 'Capacity', value: '0.5 L' },
      { key: 'Material', value: 'Stainless steel' },
    ],
  ),

  // The collective item of the demo catalog: one article, several glaze
  // colours, so its cart line asks which ones are wanted.
  {
    ...p(
      'CUP-001',
      'cappuccino-cup-set',
      'Cappuccino Cup Set (6)',
      'cups',
      5400,
      '<p>A set of six 190&nbsp;ml porcelain cappuccino cups and saucers.</p>',
      [
        { key: 'Volume', value: '190' },
        { key: 'Pieces', value: '6 cups + saucers' },
      ],
    ),
    lineNoteEnabled: true,
    lineNotePrompt: 'Which glaze colours? Sand, slate or off-white.',
  },
  p(
    'CUP-002',
    'latte-glass-set',
    'Latte Glass Set (6)',
    'cups',
    4200,
    '<p>Six double-walled 300&nbsp;ml latte glasses.</p>',
    [
      { key: 'Volume', value: '300' },
      { key: 'Pieces', value: '6 glasses' },
    ],
  ),

  // The pairing case (FR-SET-01): a takeaway cup nobody orders without a lid,
  // and two lids that fit it — which is why the model is edges rather than a
  // set, since each lid is sold with the cup and not with the other lid.
  // On the shelf whatever its position on the ladder below works out to: this
  // is the product the pairing is demonstrated from, and one that cannot be
  // put in a cart demonstrates nothing.
  {
    ...p(
      'CUP-003',
      'takeaway-cup-300',
      'Takeaway Cup 300 ml (50)',
      'cups',
      1350,
      '<p>Fifty double-walled 300&nbsp;ml takeaway cups, unprinted.</p>',
      [
        { key: 'Volume', value: '300' },
        { key: 'Pieces', value: '50 cups' },
      ],
    ),
    stockPieces: 240,
  },
  p(
    'CUP-004',
    'takeaway-lid-flat',
    'Takeaway Lid, Flat (50)',
    'cups',
    490,
    '<p>Fifty flat sip lids for the 300&nbsp;ml takeaway cup.</p>',
    [
      { key: 'Volume', value: '300' },
      { key: 'Pieces', value: '50 lids' },
    ],
  ),
  p(
    'CUP-005',
    'takeaway-lid-domed',
    'Takeaway Lid, Domed (50)',
    'cups',
    540,
    '<p>Fifty domed lids for the 300&nbsp;ml takeaway cup, for topped drinks.</p>',
    [
      { key: 'Volume', value: '300' },
      { key: 'Pieces', value: '50 lids' },
    ],
  ),
];

/**
 * The demo's sold-together pairings (FR-SET-01), by product slug. Undirected:
 * each line is one edge, and the seed writes it once whichever way round it is
 * written here.
 */
export const pairingSeeds: [string, string][] = [
  ['takeaway-cup-300', 'takeaway-lid-flat'],
  ['takeaway-cup-300', 'takeaway-lid-domed'],
];

/**
 * Pieces on hand, so the demo shows all four cases a listing can hold at once —
 * including the default one, an untracked product with no badge, which is what
 * a deployment that never enters a figure looks like everywhere.
 *
 * The low figure is under every threshold in the catalog (a box of 24, a pack
 * of 6, the shop's own 10), so a "few left" row reads the same whatever the
 * product is packed in.
 */
const demoStock = (n: number): number | undefined => {
  if (n % 11 === 0) return undefined;
  if (n % 9 === 0) return 0;
  if (n % 7 === 0) return 4;
  return 120 + n;
};

/**
 * Every 5th ships without images, so the demo exercises the no-photo placeholder
 * (real deployments will always have products awaiting photography).
 * Deterministic by position → a re-seed leaves the same rows imageless.
 */
export const productSeeds: ProductSeed[] = allProducts.map((product, i) => {
  const n = i + 1;
  // A product that states its own figure keeps it; the ladder fills in the rest.
  const stockPieces = product.stockPieces ?? demoStock(n);
  return {
    ...product,
    ...(stockPieces === undefined ? {} : { stockPieces }),
    ...(n % 5 === 0 ? { imageCount: 0 } : {}),
  };
});
