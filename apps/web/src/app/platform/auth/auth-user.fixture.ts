import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** One identity per role, for specs. */
export const adminUser: AuthUser = {
  id: 'a',
  email: 'admin@example.com',
  role: 'admin',
  // Staff often have no name, so this one exercises the fallback.
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

/** Staff without the catalog. */
export const managerUser: AuthUser = {
  id: 'm',
  email: 'manager@example.com',
  role: 'manager',
  firstName: null,
  mustChangePassword: false,
};
