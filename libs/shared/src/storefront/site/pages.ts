import type { ConsentPurpose, PageSlug } from '../../core/site/pages';

/**
 * The pages the generic `/:slug` route serves. `contact` and `conditions` have
 * code routes that keep their configured parts (offices, zones, payment) in
 * their own markup around the prose; a consent text sits under its form.
 */
export const STANDALONE_PAGE_SLUGS = [
  'about',
  'terms',
  'privacy',
  'imprint',
  'withdrawal',
] as const satisfies readonly PageSlug[];

/**
 * The pages a reader may hold the shop to, so they say when their text last
 * changed. Not `conditions`: most of it is read live from configuration.
 */
const DATED_PAGE_SLUGS = [
  'terms',
  'privacy',
  'imprint',
  'withdrawal',
  'consent-contact',
  'consent-account',
] as const satisfies readonly PageSlug[];

export function isDatedPage(slug: string): boolean {
  return (DATED_PAGE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Where each consent text is read: under the form that asks for it. The
 * account text sits under registration because its readers have no session.
 */
export const CONSENT_PATHS = {
  contact: '/inquiry/consent',
  account: '/register/consent',
} as const satisfies Record<ConsentPurpose, string>;
