import { Client } from 'pg';
import { ConsentConfig } from '@b2b-catalog-platform/shared';
import {
  CONSENT_PAGE_SLUGS,
  ConsentPurpose,
} from '@b2b-catalog-platform/shared/core/site';
import { SeedBundle } from './bundle';

/**
 * The consents the demo's people would have given (NFR-LEGAL-09), for the
 * purposes the deployment asks for and no others: a record of a box nobody
 * was shown would be evidence of nothing.
 *
 * A customer who registered gave the account consent on the form, dated when
 * they registered. An invited one has not chosen a password yet, so has not
 * been asked; the box waits on their first password. The bundle's inquiry is a
 * contact-form consent with no account behind it, so a search by address finds
 * something on a demo. Create-if-missing, like the accounts: a record is never
 * written twice, and never changed.
 */
export async function seedConsents(
  client: Client,
  accounts: SeedBundle['accounts'],
  asked: ConsentConfig,
): Promise<void> {
  if (asked.account) {
    const version = await currentVersion(client, 'account');
    const registered = accounts.accounts.filter(
      (account) =>
        account.role === 'user' &&
        ['pending', 'active', 'disabled'].includes(account.status),
    );
    for (const account of registered) {
      if (!version) break;
      await client.query(
        `INSERT INTO consents (purpose, "pageVersionId", "userId", email, "createdAt")
         SELECT 'account', $1, u.id, u.email, u."createdAt"
           FROM users u
          WHERE u.email = $2
            AND NOT EXISTS (
              SELECT 1 FROM consents c
               WHERE c."userId" = u.id AND c.purpose = 'account')`,
        [version, account.email],
      );
    }
  }

  if (asked.contact) {
    const version = await currentVersion(client, 'contact');
    if (version) {
      await client.query(
        `INSERT INTO consents (purpose, "pageVersionId", email, phone, "createdAt")
         SELECT 'contact', $1, $2::varchar, $3::varchar, now() - interval '9 days'
          WHERE NOT EXISTS (
            SELECT 1 FROM consents WHERE purpose = 'contact' AND email = $2)`,
        [version, accounts.inquiry.email, accounts.inquiry.phone],
      );
    }
  }
}

/** The text's current version; none while the page was never written. */
async function currentVersion(
  client: Client,
  purpose: ConsentPurpose,
): Promise<string | undefined> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM page_versions WHERE slug = $1
      ORDER BY version DESC LIMIT 1`,
    [CONSENT_PAGE_SLUGS[purpose]],
  );
  return rows[0]?.id;
}
