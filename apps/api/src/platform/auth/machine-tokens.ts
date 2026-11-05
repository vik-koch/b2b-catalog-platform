import { MachineClient } from './machine-client';

/**
 * The token lookup behind MachineTokenGuard. Platform may not import the
 * exchange, which keeps the tokens, so it answers through this and the app
 * root wires it.
 */
export interface MachineTokens {
  /** The client behind a live token, or null for an unknown or revoked one:
   * the caller is owed no difference. */
  authenticate(value: string): Promise<MachineClient | null>;
}

export const MACHINE_TOKENS = 'MACHINE_TOKENS';
