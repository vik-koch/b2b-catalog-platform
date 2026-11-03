/** Who the shop stays open to while maintenance mode is on (FR-ADM-04):
 * staff, who preview it. A customer is a visitor until it opens. */
export function passesMaintenance(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}
