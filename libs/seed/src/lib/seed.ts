import { Client } from 'pg';
import { ConsentConfig } from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { pageSeeds } from './data';
import { seedAccounts } from './account-seed';
import { seedConsents } from './consent-seed';
import { seedCatalog } from './catalog-seed';
import { seedDocuments } from './document-seed';
import { seedOrders } from './order-seed';

/**
 * Idempotent: safe to run against a stack that was seeded before (e2e reruns,
 * demo redeploys). Expects migrations to have been applied (the API does this
 * on startup before it starts listening).
 *
 * Bodies pass through the same sanitizer as admin edits, so seeds cannot drift
 * into markup the editor could never reproduce.
 */
/** Static page content only — split out so tests can restore pages without
 * re-running the (image-generating) catalog seed. A seed that differs from the
 * current text is saved as its next version, never over one. */
export async function seedPages(client: Client): Promise<void> {
  for (const seed of pageSeeds) {
    const page = {
      title: seed.title,
      bodyHtml: sanitizeRichText(seed.bodyHtml),
      consentLabel: seed.consentLabel,
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

/**
 * `consent` is the deployment's own switch, handed in rather than read here:
 * the e2e harness seeds from outside the stack, where the stack's config path
 * does not exist.
 */
export async function seedDatabase(
  client: Client,
  mediaRoot: string,
  consent: ConsentConfig,
): Promise<void> {
  await seedPages(client);
  await seedCatalog(client, mediaRoot);
  // Independent of the catalog: a document is a record of its own, and nothing
  // links the two yet.
  await seedDocuments(client, mediaRoot);
  // Last: the wholesale price list needs the products it prices to exist.
  await seedAccounts(client);
  // …and an order needs both — the products it lines up and the account it
  // was priced for.
  await seedOrders(client);
  // After the accounts and the pages: a record names both.
  await seedConsents(client, consent);
}

/**
 * Connect, seed, disconnect. For one-shot use from the deploy pipeline, where
 * the `migrate` one-shot has already applied the schema and postgres is healthy
 * before this runs; the e2e harnesses call seedDatabase directly instead.
 */
export async function runSeed(
  connectionString: string,
  mediaRoot: string,
  consent: ConsentConfig,
): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await seedDatabase(client, mediaRoot, consent);
  } finally {
    await client.end().catch(() => undefined);
  }
}
