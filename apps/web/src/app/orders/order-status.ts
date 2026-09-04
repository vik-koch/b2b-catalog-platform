import { OrderStatus } from '@b2b-catalog-platform/shared';
import { StatusTone } from '../ui/status-badge';

/** Who is looking at the badge. */
export type OrderAudience = 'customer' | 'staff';

/**
 * The badge tone per status, shared by every screen that lists orders: settled
 * once the shop has answered, a refusal for a decline, and history for one
 * nobody is waiting on any more.
 *
 * `requested` is the one the two audiences read differently, which is why the
 * audience has to be named rather than defaulted. Amber means somebody has to
 * act, and for staff a requested order is exactly that — it is their queue,
 * and the marker on their account control points at it. A customer cannot
 * answer their own order, so the same amber promised them a task they do not
 * have; for them it is a fact about where the order stands. When order
 * processing gives a customer a status that genuinely waits on them, that one
 * becomes their amber, and it will be the only one.
 *
 * The tone is shared; the wording is not — a customer reads "Awaiting
 * confirmation" where staff read the state itself, and the two texts live in
 * their own catalogues.
 */
export function orderStatusTone(
  status: OrderStatus,
  audience: OrderAudience,
): StatusTone {
  const tones: Record<OrderStatus, StatusTone> = {
    requested: audience === 'staff' ? 'waiting' : 'info',
    approved: 'ok',
    declined: 'danger',
    cancelled: 'neutral',
  };
  return tones[status];
}
