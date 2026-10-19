import { Client } from 'pg';
import { ConsentConfig } from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { SeedBundle } from './bundle';
import { PictureMode } from './catalog-photos';
import { seedAccounts } from './account-seed';
import { seedConsents } from './consent-seed';
import { seedCatalog } from './catalog-seed';
import { seedDocuments } from './document-seed';
import { seedOrders } from './order-seed';

/**
 * Idempotent: safe to run against a stack that was seeded before (e2e reruns,
 * demo redeploys). Expects migrations to have been applied (the deploy runs the
 * `migrate` one-shot first).
 *
 * Bodies pass through the same sanitizer as admin edits, so seeds cannot drift
 * into markup the editor could never reproduce.
 */
/** Static page content only — split out so tests can restore pages without
 * re-running the (image-generating) catalog seed. A seed that differs from the
 * current text is saved as its next version, never over one. */
export async function seedPages(
  client: Client,
  pages: SeedBundle['pages'],
): Promise<void> {
  for (const seed of pages) {
    const page = {
      title: seed.title,
      bodyHtml: sanitizeRichText(seed.bodyHtml),
      consentLabel: seed.consentLabel ?? null,
    };
    const { rows } = await client.query<typeof page & { version: number }>(
      `SELECT version, title, "bodyHtml", "consentLabel" FROM page_versions
       WHERE slug = $1 ORDER BY version DESC LIMIT 1`,
      [seed.slug],
    );
    const latest = rows[0];
    if (
      latest &&
      latest.title === page.title &&
      latest.bodyHtml === page.bodyHtml &&
      latest.consentLabel === page.consentLabel
    ) {
      continue;
    }
    await client.query(
      `INSERT INTO page_versions (slug, version, title, "bodyHtml", "consentLabel")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        seed.slug,
        (latest?.version ?? 0) + 1,
        page.title,
        page.bodyHtml,
        page.consentLabel,
      ],
    );
  }
}

export interface SeedOptions {
  /** The deployment's own switch, handed in rather than read here: the e2e
   * harness seeds from outside the stack, where the stack's config path does
   * not exist. */
  consent: ConsentConfig;
  pictures: PictureMode;
}

export async function seedDatabase(
  client: Client,
  bundle: SeedBundle,
  mediaRoot: string,
  { consent, pictures }: SeedOptions,
): Promise<void> {
  await seedPages(client, bundle.pages);
  await seedCatalog(client, bundle, mediaRoot, pictures);
  // Independent of the catalog: a document is a record of its own, and nothing
  // links the two yet.
  await seedDocuments(client, bundle.documents, mediaRoot);
  // Last: the tier price lists need the products they price to exist.
  await seedAccounts(client, bundle);
  // …and an order needs both — the products it lines up and the account it
  // was priced for.
  await seedOrders(client, bundle);
  // After the accounts and the pages: a record names both.
  await seedConsents(client, bundle.accounts, consent);
}

/** Connect, seed, disconnect — the one-shot's whole job. */
export async function runSeed(
  connectionString: string,
  bundle: SeedBundle,
  mediaRoot: string,
  options: SeedOptions,
): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await seedDatabase(client, bundle, mediaRoot, options);
  } finally {
    await client.end().catch(() => undefined);
  }
}
