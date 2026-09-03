import { ProductDetail, ProductListItem } from '@b2b-catalog-platform/shared';

/**
 * Product fixtures for unit specs, so a new contract field is filled in here
 * rather than in every spec that renders a tile. Defaults describe a piece-only
 * product; override for the packaged cases.
 */

export const plainPackaging = {
  piecesPerPack: null,
  packsPerBox: null,
  minPieceQty: 1,
} as const;

/** Six pieces to a pack, four packs to a box. */
export const packagedPackaging = {
  piecesPerPack: 6,
  packsPerBox: 4,
  minPieceQty: 6,
} as const;

export function plainPrices(priceMinor: number): ProductListItem['prices'] {
  return {
    pieceMilliMinor: priceMinor * 1000,
    pieceLotMinor: priceMinor,
    pack: null,
    box: null,
  };
}

export function productListItem(
  overrides: Partial<ProductListItem> = {},
): ProductListItem {
  const priceMinor = overrides.priceMinor ?? 1250;
  return {
    slug: 'espresso-roast',
    name: 'Espresso Roast',
    priceMinor,
    prices: plainPrices(priceMinor),
    packaging: { ...plainPackaging },
    images: [],
    lineNoteEnabled: false,
    lineNotePrompt: null,
    availability: null,
    ...overrides,
  };
}

export function productDetail(
  overrides: Partial<ProductDetail> = {},
): ProductDetail {
  const priceMinor = overrides.priceMinor ?? 1250;
  return {
    slug: 'espresso-roast',
    name: 'Espresso Roast',
    priceMinor,
    prices: plainPrices(priceMinor),
    packaging: { ...plainPackaging },
    boxDimensions: null,
    descriptionHtml: '',
    images: [],
    attributes: [],
    lineNoteEnabled: false,
    lineNotePrompt: null,
    availability: null,
    category: {
      slug: 'coffee-beans',
      name: 'Coffee Beans',
      shortName: null,
      ancestors: [],
    },
    ...overrides,
  };
}
