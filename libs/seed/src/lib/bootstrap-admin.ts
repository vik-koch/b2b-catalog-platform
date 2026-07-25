import { Client } from 'pg';

/**
 * Create the bootstrap admin if — and only if — no account with that email
 * exists yet. Unlike the content seed (which overwrites on every dev deploy),
 * this is **create-if-missing** and runs in every environment, prod included:
 * on the first deploy it seeds the admin, and on every deploy after it is a
 * no-op, so an admin who has since changed their password (or any real data) is
 * never clobbered. The password is already hashed by the caller — plaintext
 * never reaches this layer or the database.
 *
 * Returns true if a row was created, false if the admin already existed.
 */
export async function bootstrapAdmin(
  client: Client,
  email: string,
  passwordHash: string,
): Promise<boolean> {
  // Normalize to match the case-insensitive login lookup (UsersService.findByEmail).
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query(
    `INSERT INTO users (email, "passwordHash", role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [normalizedEmail, passwordHash],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Connect, bootstrap, disconnect — for one-shot use from the deploy pipeline,
 * after the `migrate` one-shot has created the `users` table. Mirrors runSeed.
 */
export async function runBootstrapAdmin(
  connectionString: string,
  email: string,
  passwordHash: string,
): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return await bootstrapAdmin(client, email, passwordHash);
  } finally {
    await client.end().catch(() => undefined);
  }
}
