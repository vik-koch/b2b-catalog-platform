/**
 * A cart missing what its products are sold with, where the deployment refuses
 * on that (FR-SET-04). Carries the shortfalls, so the page can name the lines
 * rather than send the customer back to hunt for them.
 */
export class PairingUnsatisfiedException extends Error {
  constructor(readonly shortfalls: { slug: string; shortPieces: number }[]) {
    super('The cart is missing what its products are sold with');
  }
}
