import { OrderStatus } from '@b2b-catalog-platform/shared';

/**
 * The badge tone per status, shared by every screen that lists orders: amber
 * while the shop has not answered yet, green once it has, red for a refusal,
 * grey for one nobody is waiting on any more.
 *
 * The colours are shared; the wording is not — a customer reads "Awaiting
 * confirmation" where staff read the state itself, and the two texts live in
 * their own catalogues.
 */
export function orderStatusClass(status: OrderStatus): string {
  return {
    requested: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    cancelled: 'bg-stone-200 text-muted',
  }[status];
}
