import type { ConfirmService } from '../../ui/confirm.service';

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
