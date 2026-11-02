import { Client } from 'pg';

/**
 * Creates the bootstrap admin where no account has that address, on every
 * deploy, prod included: later deploys never clobber a changed password.
 * `mustChangePassword`, since the pipeline chose the password; a seed reset
 * passes false, or its recreated admin would be asked on every reset.
 * True when a row was created.
 */
export async function bootstrapAdmin(
  client: Client,
  email: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<boolean> {
  // Lowercased like every stored address.
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query(
    // A real password from the start, which a reactivation reads.
    `INSERT INTO users (email, "passwordHash", role, "mustChangePassword", status, "passwordSetAt")
     VALUES ($1, $2, 'admin', $3, 'active', now())
     ON CONFLICT (email) DO NOTHING`,
    [normalizedEmail, passwordHash, mustChangePassword],
  );
  return (result.rowCount ?? 0) > 0;
}

/** For the deploy pipeline's one-shot, after `migrate`. */
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
