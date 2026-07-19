import type { Client } from 'pg';
import { helloWorldSeed, pageSeeds } from './data';

/**
 * Idempotent: safe to run against a stack that was seeded before (e2e reruns,
 * demo redeploys). Expects migrations to have been applied (the API does this
 * on startup before it starts listening).
 */
export async function seedDatabase(client: Client): Promise<void> {
  await client.query('DELETE FROM "helloWorld"');
  await client.query('INSERT INTO "helloWorld" (message) VALUES ($1)', [
    helloWorldSeed.message,
  ]);

  for (const { slug, title, bodyHtml } of pageSeeds) {
    await client.query(
      `INSERT INTO page (id, title, "bodyHtml") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "bodyHtml" = EXCLUDED."bodyHtml"`,
      [slug, title, bodyHtml],
    );
  }
}
