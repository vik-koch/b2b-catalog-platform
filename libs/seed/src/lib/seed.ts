import { Client } from 'pg';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { pageSeeds } from './data';

/**
 * Idempotent: safe to run against a stack that was seeded before (e2e reruns,
 * demo redeploys). Expects migrations to have been applied (the API does this
 * on startup before it starts listening).
 *
 * Seed bodies go through the same sanitizer as admin edits (ADR 0020) — not
 * because the committed demo content is untrusted, but so that the column has
 * exactly one kind of content in it and the seeds cannot drift into markup the
 * editor could never reproduce.
 *
 * `updatedAt` is left to its column default (now) and `updatedBy` to null:
 * seeded content has no human editor.
 */
export async function seedDatabase(client: Client): Promise<void> {
  for (const { slug, title, bodyHtml } of pageSeeds) {
    await client.query(
      `INSERT INTO pages (id, title, "bodyHtml") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "bodyHtml" = EXCLUDED."bodyHtml"`,
      [slug, title, sanitizeRichText(bodyHtml)],
    );
  }
}

/**
 * Connect, seed, disconnect. For one-shot use from the deploy pipeline, where
 * the `migrate` one-shot has already applied the schema and postgres is healthy
 * before this runs; the e2e harnesses call seedDatabase directly instead.
 */
export async function runSeed(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await seedDatabase(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
