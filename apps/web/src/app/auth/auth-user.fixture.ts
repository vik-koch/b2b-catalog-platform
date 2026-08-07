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
  // Staff accounts often carry no name — the bootstrap admin is a config value,
  // not a person — so the default identity is the one that has to fall back.
  firstName: null,
  mustChangePassword: false,
};

export const plainUser: AuthUser = {
  id: 'u',
  email: 'user@example.com',
  role: 'user',
  firstName: 'Alex',
  mustChangePassword: false,
};
