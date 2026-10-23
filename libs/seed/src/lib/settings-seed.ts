import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { API_TOKEN_PREFIX_LENGTH } from '@b2b-catalog-platform/shared';
import { SettingsSeed } from './bundle';

/** `<prefix>.<secret>`, both base64url: the shape the platform issues. */
const TOKEN_SHAPE = new RegExp(
  `^[A-Za-z0-9_-]{${API_TOKEN_PREFIX_LENGTH}}\\.[A-Za-z0-9_-]{32,}$`,
);

/**
 * The runtime settings a bundle starts its shop with: which areas an external
 * system owns, and that system's token.
 *
 * The token's value is handed in, never read from the bundle, and stored the
 * way the platform stores one it issued: the prefix in the clear, the whole
 * value hashed. Without a value the token is left out — the areas are still
 * owned, and nothing can feed them until a token is issued in the admin.
 */
export async function seedSettings(
  client: Client,
  settings: SettingsSeed,
  machineToken: string | undefined,
): Promise<void> {
  await client.query(
    `INSERT INTO app_settings (id, "externallyOwnedAreas")
     VALUES (1, $1::ownership_area[])
     ON CONFLICT (id) DO UPDATE
       SET "externallyOwnedAreas" = EXCLUDED."externallyOwnedAreas"`,
    [settings.externallyOwned],
  );

  const token = settings.machineToken;
  if (!token) return;
  if (!machineToken) {
    console.warn(
      `Seed: settings.json names the token "${token.name}", but SEED_MACHINE_TOKEN is not set — no token seeded`,
    );
    return;
  }
  if (!TOKEN_SHAPE.test(machineToken)) {
    throw new Error(
      `SEED_MACHINE_TOKEN is not a token: ${API_TOKEN_PREFIX_LENGTH} base64url characters, a dot, then at least 32 more`,
    );
  }
  await client.query(
    `INSERT INTO api_tokens (name, scopes, prefix, "tokenHash")
     VALUES ($1, $2::api_token_scope[], $3, $4)
     ON CONFLICT ("tokenHash") DO UPDATE
       SET name = EXCLUDED.name, scopes = EXCLUDED.scopes, "revokedAt" = NULL`,
    [
      token.name,
      token.scopes,
      machineToken.slice(0, API_TOKEN_PREFIX_LENGTH),
      createHash('sha256').update(machineToken).digest('hex'),
    ],
  );
}
