import { Client } from 'pg';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { pageSeeds } from './data';
import { seedAccounts } from './account-seed';
import { seedCatalog } from './catalog-seed';

/**
 * Idempotent: safe to run against a stack that was seeded before (e2e reruns,
 * demo redeploys). Expects migrations to have been applied (the API does this
 * on startup before it starts listening).
 *
 * Bodies pass through the same sanitizer as admin edits, so seeds cannot drift
 * into markup the editor could never reproduce.
 */
/** Static page content only — split out so tests can restore pages without
 * re-running the (image-generating) catalog seed. */
export async function seedPages(client: Client): Promise<void> {
  for (const { slug, title, bodyHtml } of pageSeeds) {
    await client.query(
      `INSERT INTO pages (id, title, "bodyHtml") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "bodyHtml" = EXCLUDED."bodyHtml"`,
      [slug, title, sanitizeRichText(bodyHtml)],
    );
  }
}

export async function seedDatabase(
  client: Client,
  mediaRoot: string,
): Promise<void> {
  await seedPages(client);
  await seedCatalog(client, mediaRoot);
  // Last: the wholesale price list needs the products it prices to exist.
  await seedAccounts(client);
}

/**
 * Connect, seed, disconnect. For one-shot use from the deploy pipeline, where
 * the `migrate` one-shot has already applied the schema and postgres is healthy
 * before this runs; the e2e harnesses call seedDatabase directly instead.
 */
export async function runSeed(
  connectionString: string,
  mediaRoot: string,
): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await seedDatabase(client, mediaRoot);
  } finally {
    await client.end().catch(() => undefined);
  }
}
