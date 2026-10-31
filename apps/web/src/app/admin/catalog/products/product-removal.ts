import { fillText } from '@b2b-catalog-platform/shared';
import {
  type ConfirmService,
  type ConfirmText,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import type { ProductsService } from './products.service';

/**
 * While the catalog is owned, only a run undoes a run's deletion (FR-ADM-10).
 * The click says so instead of the control vanishing; the server refuses
 * either way.
 */
export async function mayRestore(
  confirm: ConfirmService,
  text: { productRestoreTitle: string; productRestore: string },
  closeLabel: string,
  product: { deletedByRun: boolean },
  catalogOwned: () => Promise<boolean>,
): Promise<boolean> {
  if (!product.deletedByRun || !(await catalogOwned())) return true;
  await confirm.tell({
    heading: text.productRestoreTitle,
    message: text.productRestore,
    closeLabel,
  });
  return false;
}

export interface PurgeText {
  purgeProduct: string;
  purgeConfirm: ConfirmText;
  cancel: string;
  close: string;
  owned: string;
  /** Every catalog refusal by code, for one the click could not foresee. */
  errors: Readonly<Record<string, string>>;
}

/**
 * Why a permanent delete would be refused (FR-ADM-21): somebody ordered it,
 * or while the catalog is owned an admin deleted it and the source still
 * sends it.
 */
export function purgeRefusal(
  text: { ordered: string; owned: string },
  product: { ordered: boolean; deletedByRun: boolean },
  catalogOwned: boolean,
): string | null {
  if (product.ordered) return text.ordered;
  if (catalogOwned && !product.deletedByRun) return text.owned;
  return null;
}

/**
 * Confirmed, as the one removal step that cannot be undone, after the row has
 * told any refusal it can foresee. One it could not (an order placed since
 * the list loaded) is told too. Resolves whether the product is gone.
 */
export async function purgeWithConfirmation(
  confirm: ConfirmService,
  products: Pick<ProductsService, 'purge'>,
  text: PurgeText,
  product: { slug: string; name: string },
): Promise<boolean> {
  const confirmed = await confirm.ask({
    ...confirmRequest(text.purgeConfirm, text.cancel),
    message: fillText(text.purgeConfirm.message, { name: product.name }),
    confirmVariant: 'danger',
  });
  if (!confirmed) return false;
  const result = await products.purge(product.slug);
  if (result.ok) return true;
  await confirm.tell({
    heading: text.purgeProduct,
    message:
      result.code === 'catalog-externally-owned'
        ? text.owned
        : text.errors[result.code],
    closeLabel: text.close,
  });
  return false;
}
