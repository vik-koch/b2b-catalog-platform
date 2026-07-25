import { AuthUser } from '@b2b-catalog-platform/shared';

/**
 * Stand-in identities for tests, one per role. Shared rather than re-declared
 * per spec so a new field on AuthUser (the contract grows) is added in one place
 * instead of every file that happens to need a signed-in user.
 */
export const adminUser: AuthUser = {
  id: 'a',
  email: 'admin@example.com',
  role: 'admin',
  mustChangePassword: false,
};

export const plainUser: AuthUser = {
  id: 'u',
  email: 'user@example.com',
  role: 'user',
  mustChangePassword: false,
};
