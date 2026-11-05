import * as z from 'zod';
import type { DeepReadonly } from '../../platform/deep-readonly';

/** The catalog's block of `texts/shared.json`: what its views say in both
 * audiences, the admin's product preview being the storefront's page. */
export const sharedCatalogTextShape = {
  /** Short unit names, as a quantity is stated beside goods. */
  units: z
    .object({ piece: z.string(), pack: z.string(), box: z.string() })
    .strict(),
  /** A product's packing, as the product page states it and the editor
   * asks for it. */
  packaging: z
    .object({
      heading: z.string(),
      packContains: z.string(),
      boxContains: z.string(),
      boxVolume: z.string(),
      boxWeight: z.string(),
    })
    .strict(),
  /** What a product's parts are called, on its page and in its editor. */
  product: z
    .object({
      description: z.string(),
      documents: z.string(),
      variants: z.string(),
      /** The products sold together with this one. */
      pairings: z.string(),
      availability: z
        .object({ in: z.string(), low: z.string(), out: z.string() })
        .strict(),
    })
    .strict(),
  /** A product sold as a set of parts (FR-CAT-10): `short` on a card or a
   * line, `full` on its page and as the badge's tooltip; `{parts}` joined by
   * " + ". */
  set: z
    .object({
      short: z.string(),
      full: z.string(),
    })
    .strict(),
  /** A product's variants (FR-CAT-11/12/13). `unavailable` follows a variant
   * marked so, `note` stands under the list, `markLabel` names the badge that
   * opens it (`{count}`). */
  variants: z
    .object({
      unavailable: z.string(),
      note: z.string(),
      markLabel: z.string(),
    })
    .strict(),
  /** Products sold together (FR-SET-05); their name is `product.pairings`,
   * so a customer meets one word for them. `{count}` counts the counterparts. */
  pairings: z
    .object({
      marker: z.string(),
      /** Read under the heading, once the panel is open. */
      intro: z.string(),
      /** Where the counterparts could not be fetched. */
      loadError: z.string(),
    })
    .strict(),
  /** The documents a product page lists (FR-DOC-03). `hintAria` describes
   * every link, as each one leaves the page. */
  documents: z
    .object({
      hintAria: z.string(),
      /** The accessible name of a document's link beside its file
       * (FR-DOC-05); must contain `{host}`, which is what it shows. */
      linkAria: z.string(),
    })
    .strict(),
  /** Units of sale in sentences (FR-UNIT-*); the unit words are the
   * abbreviations in `units`, which follow a number and never inflect. */
  unitFacts: z
    .object({
      /** Price labels; `{unit}` is one of the abbreviations above. */
      perUnit: z.string(),
      /** Counts and abbreviations as placeholders, so a deployment can
       * reorder them: "4 pk × 6 pcs = 24 pcs". */
      packagingFormula: z.string(),
      /** Used where a product has packs but no box. */
      packagingPerPack: z.string(),
      minQuantity: z.string(),
      boxCountSuffix: z.string(),
      /** The unit selector's labels, apart from the abbreviations: they
       * decide a segment's width. */
      select: z
        .object({
          piece: z.string(),
          pack: z.string(),
          box: z.string(),
        })
        .strict(),
    })
    .strict(),
  specifications: z.string(),
  /** Over the four facts beside the photo; `allSpecifications` links on to
   * the whole table. */
  mainSpecifications: z.string(),
  allSpecifications: z.string(),
  /** The catalogue's root in a breadcrumb (FR-CAT-03/04). */
  catalogRoot: z.string(),
  /** A gallery thumbnail's name: `{n}`. */
  viewImageAria: z.string(),
  /** The buy controls, wherever a product is put in the cart. */
  buying: z
    .object({
      unitAria: z.string(),
      quantityAria: z.string(),
      /** Under a unit the product is not sold in: the segment is shown, not
       * hidden, so it says why. */
      unitNotSold: z.string(),
      /** The stepper's icon buttons. */
      decreaseAria: z.string(),
      increaseAria: z.string(),
      noteLabel: z.string(),
      /** Fallback prompt where the product names none of its own. */
      notePrompt: z.string(),
      /** The note button on a card or a row, named for what it does: no room
       * there for a labelled field. */
      noteAdd: z.string(),
      noteEdit: z.string(),
      add: z.string(),
      /** In the add button's place once the product is in the cart, so the
       * controls read as an edit of that line; `{total}`. */
      addedFor: z.string(),
      /** Refused because the cart already holds as many lines as may be
       * priced in one call (`CART_LINES_MAX`). */
      full: z.string(),

      /** Asked when `−` goes below the smallest quantity sold, and the two
       * answers. */
      removeQuestion: z.string(),
      removeYes: z.string(),
      removeNo: z.string(),
      /** Shown instead of a figure where a line cannot be priced. */
      noPrice: z.string(),
      /** A quantity rounded to what can be supplied. */
      quantityCorrected: z.string(),
    })
    .strict(),
};

export type SharedCatalogText = DeepReadonly<
  z.infer<z.ZodObject<typeof sharedCatalogTextShape>>
>;
