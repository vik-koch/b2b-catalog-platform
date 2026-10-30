import { fillText } from '@b2b-catalog-platform/shared';
import {
  type ConfirmService,
  type ConfirmText,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import type { ProductsService } from './products.service';

/**
 * A removal step refused in advance (FR-ADM-10), answered where the click is
 * made: the control stays and the click says why, as an unpriced product's
 * publish button does. Returns whether the click may go ahead. The server
 * refuses either way; this is the screen agreeing with it, not enforcing it.
 *
 * While the catalog is owned, a run's deletion is a run's to undo.
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

/** The wording the permanent delete reads, wherever it is offered. */
export interface PurgeText {
  purgeProduct: string;
  purgeConfirm: ConfirmText;
  cancel: string;
  close: string;
  ordered: string;
  owned: string;
  /** Every catalog refusal by code, for one the click could not foresee. */
  errors: Readonly<Record<string, string>>;
}

/**
 * Why deleting a product permanently would be refused (FR-ADM-21), or null
 * where it can succeed: somebody ordered it, or — while the catalog is owned —
 * an admin deleted it and the source still sends it.
 */
export function purgeRefusal(
  text: Pick<PurgeText, 'ordered' | 'owned'>,
  product: { ordered: boolean; deletedByRun: boolean },
  catalogOwned: boolean,
): string | null {
  if (product.ordered) return text.ordered;
  if (catalogOwned && !product.deletedByRun) return text.owned;
  return null;
}

/**
 * The whole permanent delete from a click: the refusal said where there is
 * one, otherwise a confirmation — it is the one removal step that cannot be
 * undone — then the call, and a refusal the screen could not foresee (an
 * order placed since it loaded) told rather than swallowed. Resolves whether
 * the product is gone.
 */
export async function purgeWithConfirmation(
  confirm: ConfirmService,
  products: Pick<ProductsService, 'purge'>,
  text: PurgeText,
  product: {
    slug: string;
    name: string;
    ordered: boolean;
    deletedByRun: boolean;
  },
  catalogOwned: () => Promise<boolean>,
): Promise<boolean> {
  const tell = (message: string) =>
    confirm.tell({
      heading: text.purgeProduct,
      message,
      closeLabel: text.close,
    });
  const refusal = purgeRefusal(text, product, await catalogOwned());
  if (refusal) {
    await tell(refusal);
    return false;
  }
  const confirmed = await confirm.ask({
    ...confirmRequest(text.purgeConfirm, text.cancel),
    message: fillText(text.purgeConfirm.message, { name: product.name }),
    confirmVariant: 'danger',
  });
  if (!confirmed) return false;
  const result = await products.purge(product.slug);
  if (result.ok) return true;
  await tell(
    result.code === 'catalog-externally-owned'
      ? text.owned
      : text.errors[result.code],
  );
  return false;
}
