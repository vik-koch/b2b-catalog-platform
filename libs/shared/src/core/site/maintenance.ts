/**
 * Who the shop stays open to while maintenance mode is on (FR-ADM-04): staff,
 * who fill the catalog behind the gate and preview it. A customer is a visitor
 * like any other until the shop opens — no sign-in, no account pages.
 */
export function passesMaintenance(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}
