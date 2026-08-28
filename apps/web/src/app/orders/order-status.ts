import { OrderStatus } from '@b2b-catalog-platform/shared';
import { StatusTone } from '../ui/status-badge';

/**
 * The badge tone per status, shared by every screen that lists orders: waiting
 * while the shop has not answered yet, settled once it has, a refusal for a
 * decline, and history for one nobody is waiting on any more.
 *
 * The tone is shared; the wording is not — a customer reads "Awaiting
 * confirmation" where staff read the state itself, and the two texts live in
 * their own catalogues.
 */
export function orderStatusTone(status: OrderStatus): StatusTone {
  return {
    requested: 'waiting',
    approved: 'ok',
    declined: 'danger',
    cancelled: 'neutral',
  }[status] as StatusTone;
}
