import {
  CatalogImage,
  ProductAvailability,
  ProductImage,
  ProductPackaging,
  ProductUnit,
  ProductVariant,
  UnitPrices,
} from '@b2b-catalog-platform/shared/core/catalog';

/** What a product page hands over to record a line: the choice, plus the
 * prices it was made against so a merged quantity re-prices exactly. */
export interface CartAddition {
  slug: string;
  name: string;
  unit: ProductUnit;
  pieces: number;
  note: string | null;
  prices: UnitPrices;
  packaging: ProductPackaging;
  /** The photo the customer was looking at, so the cart can draw the line
   * before it has asked the server anything. */
  image: CatalogImage | null;
  /** What the adding view said about the stock: the line's first baseline. */
  availability: ProductAvailability | null;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  /** How many products the adding view said it is sold with (FR-SET-05), so
   * the line wears the marker at once. */
  pairedCount: number;
  /** What the view it was added from said one piece is made of (FR-CAT-10). */
  parts: string[];
  /** Its variants and their pictures, as that view showed them (FR-CAT-11). */
  variants: ProductVariant[];
  images: ProductImage[];
}

/** `full` when the cart already holds as many lines as may be priced in one
 * call, and the addition would be one more. */
export type CartAddResult = 'added' | 'full';

/** As much of a cart line as the buying controls read back. */
export interface ProductInCart {
  unit: ProductUnit;
  pieces: number;
  note: string | null;
}

/**
 * The cart as the buying controls see it. Catalog may not import ordering, so
 * the app root provides the cart under this token.
 */
export abstract class ProductCart {
  abstract lineFor(slug: string): ProductInCart | undefined;
  abstract add(addition: CartAddition): CartAddResult;
  abstract setLine(addition: CartAddition): void;
  abstract setNote(slug: string, note: string | null): void;
  abstract remove(slug: string): void;
}
