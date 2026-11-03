import { OrderRevisionKind } from '@b2b-catalog-platform/shared/core/ordering';

/** What a version was written for, in admin words: placed, moved, changed.
 * Shared by the thread and the version screen. */
export function revisionKindLabel(
  kind: OrderRevisionKind,
  text: { submitted: string; moved: string; changed: string },
): string {
  if (kind === 'submitted') return text.submitted;
  if (kind === 'transition') return text.moved;
  return text.changed;
}
