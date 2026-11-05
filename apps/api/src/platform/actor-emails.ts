/**
 * The current address of each account a trail names. Platform and the areas
 * below accounts may not import it, so accounts answers through this and the
 * app root wires it.
 */
export interface ActorEmails {
  /** By id, for the accounts still there; a trail keeps its own copy for the
   * rest. */
  currentOf(ids: readonly string[]): Promise<Map<string, string>>;
}

export const ACTOR_EMAILS = 'ACTOR_EMAILS';
