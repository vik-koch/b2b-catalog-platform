import { Client } from 'pg';

/**
 * Create the bootstrap admin if — and only if — no account with that email
 * exists yet. Unlike the content seed (which resets a demo stack wholesale),
 * this is **create-if-missing** and runs in every environment, prod included:
 * on the first deploy it seeds the admin, and on every deploy after it is a
 * no-op, so an admin who has since changed their password (or any real data) is
 * never clobbered. The password is already hashed by the caller — plaintext
 * never reaches this layer or the database.
 *
 * `mustChangePassword`: the deploy pipeline chose this password, not the
 * admin, so a real deployment forces a change on first sign-in and the app
 * clears the flag then; because this INSERT is create-if-missing, a later
 * deploy never re-raises it. A stack reset to a seed bundle passes false: its
 * admin is recreated on every reset and would be asked again each time.
 *
 * Returns true if a row was created, false if the admin already existed.
 */
export async function bootstrapAdmin(
  client: Client,
  email: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<boolean> {
  // Normalize to match the case-insensitive login lookup (UsersService.findByEmail).
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query(
    // passwordSetAt: the row holds a real password from the moment it exists,
    // which is what a later reactivation reads to put the account back where
    // it was.
    `INSERT INTO users (email, "passwordHash", role, "mustChangePassword", status, "passwordSetAt")
     VALUES ($1, $2, 'admin', $3, 'active', now())
     ON CONFLICT (email) DO NOTHING`,
    [normalizedEmail, passwordHash, mustChangePassword],
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
  mustChangePassword: boolean,
): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return await bootstrapAdmin(
      client,
      email,
      passwordHash,
      mustChangePassword,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
