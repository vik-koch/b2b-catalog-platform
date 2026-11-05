import { UserRole } from '@b2b-catalog-platform/shared/platform';

/** What a session reads of the account it names. */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly tokenVersion: number;
  readonly firstName: string | null;
  readonly mustChangePassword: boolean;
  readonly tierId: string | null;
}

/**
 * The account behind a session. Platform may not import accounts, so accounts
 * answers through this and the app root wires it.
 */
export interface SessionUsers {
  /** Undefined for an account that is gone or may not sign in. */
  find(id: string): Promise<SessionUser | undefined>;
}

export const SESSION_USERS = 'SESSION_USERS';
