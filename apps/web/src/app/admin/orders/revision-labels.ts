import { OrderRevisionKind } from '@b2b-catalog-platform/shared';

/**
 * What a version was written for, in the admin's own words — the customer
 * placing the order, the shop moving it, the shop changing it.
 *
 * Shared by the thread on the order page and the screen that reads one version
 * back, so a version is described one way wherever it is met.
 */
export function revisionKindLabel(
  kind: OrderRevisionKind,
  text: { submitted: string; moved: string; changed: string },
): string {
  if (kind === 'submitted') return text.submitted;
  if (kind === 'transition') return text.moved;
  return text.changed;
}
