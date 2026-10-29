import { InjectionToken } from '@angular/core';
import type {
  HiddenProduct,
  ProductPage,
} from '@b2b-catalog-platform/shared/core/catalog';

/** The admin catalog calls edit mode makes from a storefront page. */
export interface EditModeCatalog {
  getProductPage(slug: string): Promise<ProductPage | null>;
  listHiddenProducts(slug: string): Promise<HiddenProduct[]>;
  unpublishMessage(
    product: { slug: string; name: string },
    text: { unpublishConfirm: { message: string }; unpublishStranded: string },
  ): Promise<string>;
  /** Edit mode reloads the page after it, so what comes back is not read. */
  setProductPublished(slug: string, published: boolean): Promise<unknown>;
}

/**
 * Loads the admin's catalog client when edit mode first needs it. The root
 * provides it from the admin side; a storefront page asks for it here, so it
 * never names admin code and the client stays out of a visitor's first load.
 */
export const EDIT_MODE_CATALOG = new InjectionToken<
  () => Promise<EditModeCatalog>
>('EDIT_MODE_CATALOG');
