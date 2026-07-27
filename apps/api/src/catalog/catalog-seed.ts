import {
  CatalogImage,
  CategoryNode,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';

/**
 * Fake in-memory catalog backing the read endpoints while the storefront UI is
 * built. It stands in for the DB-backed read model that the file sync (FR-ADM)
 * will populate later — the API shape it serves is the real contract, only the
 * data source is temporary. Deliberately no `source_id` here: that private sync
 * key does not exist on the read path.
 *
 * Images point at a public placeholder service, seeded per slug so a product
 * keeps the same photos across requests.
 */

interface SeedCategory {
  slug: string;
  name: string;
  /** Root categories have `null`. */
  parentSlug: string | null;
  /** The admin presentation overlay; `null` until an image is attached. */
  imageUrl: string | null;
}

interface SeedProduct {
  slug: string;
  name: string;
  /** The single (leaf) category this product sits in. */
  categorySlug: string;
  priceMinor: number;
  descriptionHtml: string;
  imageCount: number;
  attributes: ProductAttribute[];
}

const placeholder = (seed: string, i: number): string =>
  `https://picsum.photos/seed/${seed}-${i}/800/800`;

export function seedImages(slug: string, count: number): CatalogImage[] {
  return Array.from({ length: count }, (_, i) => ({
    url: placeholder(slug, i + 1),
    alt: '',
  }));
}

const CATEGORY_IMG = (seed: string): string => placeholder(`cat-${seed}`, 1);

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'coffee-beans',
    name: 'Coffee Beans',
    parentSlug: null,
    imageUrl: CATEGORY_IMG('coffee-beans'),
  },
  {
    slug: 'espresso',
    name: 'Espresso Roasts',
    parentSlug: 'coffee-beans',
    imageUrl: CATEGORY_IMG('espresso'),
  },
  {
    slug: 'filter',
    name: 'Filter Roasts',
    parentSlug: 'coffee-beans',
    imageUrl: CATEGORY_IMG('filter'),
  },
  { slug: 'decaf', name: 'Decaf', parentSlug: 'coffee-beans', imageUrl: null },
  { slug: 'tea', name: 'Tea', parentSlug: null, imageUrl: CATEGORY_IMG('tea') },
  {
    slug: 'equipment',
    name: 'Equipment',
    parentSlug: null,
    imageUrl: CATEGORY_IMG('equipment'),
  },
  {
    slug: 'grinders',
    name: 'Grinders',
    parentSlug: 'equipment',
    imageUrl: CATEGORY_IMG('grinders'),
  },
  {
    slug: 'machines',
    name: 'Espresso Machines',
    parentSlug: 'equipment',
    imageUrl: CATEGORY_IMG('machines'),
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    parentSlug: null,
    imageUrl: CATEGORY_IMG('accessories'),
  },
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
  { key: 'Net weight', value: '1 kg' },
];

const beanDescription = (name: string, notes: string): string =>
  `<p>${name} is a wholesale specialty lot roasted to order in Hamburg.</p>` +
  `<p>Expect <strong>${notes}</strong> in the cup. Supplied in 1&nbsp;kg bags, ` +
  `whole bean, with a roast date on every bag.</p>` +
  `<ul><li>Roasted to order</li><li>Traceable single origin</li>` +
  `<li>Available on standing order</li></ul>`;

export const SEED_PRODUCTS: SeedProduct[] = [
  // Espresso — enough items to exercise pagination on one category.
  {
    slug: 'hafen-espresso',
    name: 'Hafen Espresso',
    categorySlug: 'espresso',
    priceMinor: 1890,
    imageCount: 3,
    descriptionHtml: beanDescription(
      'Hafen Espresso',
      'dark chocolate, hazelnut and a syrupy body',
    ),
    attributes: beanAttributes(
      'Brazil / India blend',
      'Dark',
      'Natural',
      'chocolate, hazelnut',
    ),
  },
  {
    slug: 'kontor-classic',
    name: 'Kontor Classic',
    categorySlug: 'espresso',
    priceMinor: 1990,
    imageCount: 3,
    descriptionHtml: beanDescription(
      'Kontor Classic',
      'caramel, toasted almond and a round finish',
    ),
    attributes: beanAttributes(
      'Central America blend',
      'Medium-dark',
      'Washed',
      'caramel, almond',
    ),
  },
  {
    slug: 'notturno-ristretto',
    name: 'Notturno Ristretto',
    categorySlug: 'espresso',
    priceMinor: 2090,
    imageCount: 2,
    descriptionHtml: beanDescription(
      'Notturno Ristretto',
      'cocoa, dried fig and molasses',
    ),
    attributes: beanAttributes('Indonesia', 'Dark', 'Wet-hulled', 'cocoa, fig'),
  },
  {
    slug: 'crema-doro',
    name: "Crema d'Oro",
    categorySlug: 'espresso',
    priceMinor: 2150,
    imageCount: 3,
    descriptionHtml: beanDescription(
      "Crema d'Oro",
      'brown sugar, orange peel and a thick crema',
    ),
    attributes: beanAttributes(
      'Colombia',
      'Medium',
      'Washed',
      'brown sugar, orange',
    ),
  },
  {
    slug: 'speicher-blend',
    name: 'Speicher Blend',
    categorySlug: 'espresso',
    priceMinor: 1790,
    imageCount: 2,
    descriptionHtml: beanDescription(
      'Speicher Blend',
      'red apple, praline and a soft acidity',
    ),
    attributes: beanAttributes(
      'Ethiopia / Brazil',
      'Medium',
      'Mixed',
      'apple, praline',
    ),
  },

  // Filter
  {
    slug: 'yirgacheffe-filter',
    name: 'Yirgacheffe Filter',
    categorySlug: 'filter',
    priceMinor: 2290,
    imageCount: 3,
    descriptionHtml: beanDescription(
      'Yirgacheffe Filter',
      'jasmine, bergamot and stone fruit',
    ),
    attributes: beanAttributes(
      'Ethiopia',
      'Light',
      'Washed',
      'jasmine, bergamot',
    ),
  },
  {
    slug: 'huila-filter',
    name: 'Huila Filter',
    categorySlug: 'filter',
    priceMinor: 2190,
    imageCount: 2,
    descriptionHtml: beanDescription(
      'Huila Filter',
      'red berries, panela and a clean finish',
    ),
    attributes: beanAttributes(
      'Colombia',
      'Light-medium',
      'Washed',
      'red berries, panela',
    ),
  },
  {
    slug: 'kenya-ab-filter',
    name: 'Kenya AB Filter',
    categorySlug: 'filter',
    priceMinor: 2490,
    imageCount: 3,
    descriptionHtml: beanDescription(
      'Kenya AB Filter',
      'blackcurrant, tomato and a juicy acidity',
    ),
    attributes: beanAttributes(
      'Kenya',
      'Light',
      'Washed',
      'blackcurrant, juicy',
    ),
  },

  // Decaf
  {
    slug: 'ohne-decaf',
    name: 'Ohne Decaf',
    categorySlug: 'decaf',
    priceMinor: 1990,
    imageCount: 2,
    descriptionHtml: beanDescription(
      'Ohne Decaf',
      'milk chocolate and roasted nut, fully decaffeinated',
    ),
    attributes: beanAttributes(
      'Colombia',
      'Medium',
      'Sugarcane EA',
      'milk chocolate, nut',
    ),
  },

  // Tea
  {
    slug: 'ostfriesen-broken',
    name: 'Ostfriesen Broken',
    categorySlug: 'tea',
    priceMinor: 1290,
    imageCount: 2,
    descriptionHtml:
      '<p>A robust Assam broken-leaf blend, malty and strong — the classic base for a hearty cup.</p>',
    attributes: [
      { key: 'Type', value: 'Black tea' },
      { key: 'Origin', value: 'Assam' },
      { key: 'Net weight', value: '500 g' },
    ],
  },
  {
    slug: 'sencha-green',
    name: 'Sencha Green',
    categorySlug: 'tea',
    priceMinor: 1490,
    imageCount: 2,
    descriptionHtml:
      '<p>Grassy, fresh Japanese sencha with a gentle sweetness.</p>',
    attributes: [
      { key: 'Type', value: 'Green tea' },
      { key: 'Origin', value: 'Japan' },
      { key: 'Net weight', value: '250 g' },
    ],
  },

  // Grinders
  {
    slug: 'kontor-grind-one',
    name: 'Kontor Grind One',
    categorySlug: 'grinders',
    priceMinor: 34900,
    imageCount: 3,
    descriptionHtml:
      '<p>A flat-burr shop grinder built for a busy counter. Stepless adjustment, quiet motor.</p>',
    attributes: [
      { key: 'Burr', value: '64 mm flat' },
      { key: 'Adjustment', value: 'Stepless' },
      { key: 'Hopper', value: '1.2 kg' },
    ],
  },
  {
    slug: 'kontor-grind-hand',
    name: 'Kontor Hand Grinder',
    categorySlug: 'grinders',
    priceMinor: 8900,
    imageCount: 2,
    descriptionHtml:
      '<p>A precise hand grinder for filter brewing on the go.</p>',
    attributes: [
      { key: 'Burr', value: '38 mm conical' },
      { key: 'Body', value: 'Anodised aluminium' },
    ],
  },

  // Machines
  {
    slug: 'hafen-dual-boiler',
    name: 'Hafen Dual Boiler',
    categorySlug: 'machines',
    priceMinor: 189000,
    imageCount: 3,
    descriptionHtml:
      '<p>A dual-boiler espresso machine for simultaneous brewing and steaming. PID controlled.</p>',
    attributes: [
      { key: 'Boilers', value: 'Dual' },
      { key: 'Control', value: 'PID' },
      { key: 'Portafilter', value: '58 mm' },
    ],
  },

  // Accessories
  {
    slug: 'tamper-58',
    name: 'Precision Tamper 58 mm',
    categorySlug: 'accessories',
    priceMinor: 4500,
    imageCount: 2,
    descriptionHtml:
      '<p>A weighted 58&nbsp;mm stainless tamper with a walnut handle.</p>',
    attributes: [
      { key: 'Diameter', value: '58 mm' },
      { key: 'Material', value: 'Stainless / walnut' },
    ],
  },
  {
    slug: 'milk-pitcher-05',
    name: 'Milk Pitcher 0.5 L',
    categorySlug: 'accessories',
    priceMinor: 2900,
    imageCount: 2,
    descriptionHtml:
      '<p>A 0.5&nbsp;litre stainless steaming pitcher with a sharp spout for latte art.</p>',
    attributes: [
      { key: 'Capacity', value: '0.5 L' },
      { key: 'Material', value: 'Stainless steel' },
    ],
  },
];

/** Build the category forest (root-first, children in seed order). */
export function buildCategoryTree(): CategoryNode[] {
  const bySlug = new Map<string, CategoryNode>();
  for (const c of SEED_CATEGORIES) {
    bySlug.set(c.slug, {
      slug: c.slug,
      name: c.name,
      imageUrl: c.imageUrl,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const c of SEED_CATEGORIES) {
    const node = bySlug.get(c.slug)!;
    if (c.parentSlug === null) {
      roots.push(node);
    } else {
      bySlug.get(c.parentSlug)?.children.push(node);
    }
  }
  return roots;
}

export function findCategory(slug: string): SeedCategory | undefined {
  return SEED_CATEGORIES.find((c) => c.slug === slug);
}

/** Ancestors of a category, root-first, excluding the category itself. */
export function categoryAncestors(
  slug: string,
): { slug: string; name: string }[] {
  const crumbs: { slug: string; name: string }[] = [];
  let current = findCategory(slug)?.parentSlug ?? null;
  while (current) {
    const c = findCategory(current);
    if (!c) break;
    crumbs.unshift({ slug: c.slug, name: c.name });
    current = c.parentSlug;
  }
  return crumbs;
}

/** Slugs of a category plus all its descendants — so selecting a parent shows
 * everything beneath it (products live only on leaves). */
export function categoryAndDescendantSlugs(slug: string): Set<string> {
  const result = new Set<string>([slug]);
  let added = true;
  while (added) {
    added = false;
    for (const c of SEED_CATEGORIES) {
      if (c.parentSlug && result.has(c.parentSlug) && !result.has(c.slug)) {
        result.add(c.slug);
        added = true;
      }
    }
  }
  return result;
}

export function findProduct(slug: string): SeedProduct | undefined {
  return SEED_PRODUCTS.find((p) => p.slug === slug);
}
