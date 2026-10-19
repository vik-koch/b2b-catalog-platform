import * as z from 'zod';
import { deploymentConfigSchema } from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { loadSeedBundle, runSeed } from '@b2b-catalog-platform/seed';

/**
 * The seed one-shot: writes a seed bundle's demo content into a migrated
 * database, then exits. Runs on a stock Node image rather than the API's
 * (compose.yml), so no image that serves a shop carries demo content.
 */
const env = z
  .object({
    DATABASE_URL: z.url(),
    // Where seeded pictures and documents are stored: the api's media volume.
    MEDIA_ROOT: z.string().min(1),
    // The deployment config, for which consents it asks for.
    CONFIG_PATH: z.string().min(1),
    // The seed bundle (seed/README.md).
    SEED_PATH: z.string().min(1),
    // `placeholder` draws every picture instead of downloading the bundle's
    // photos — what the e2e suites seed, so no test run needs the network.
    SEED_PICTURES: z.enum(['download', 'placeholder']).default('download'),
  })
  .parse(process.env);

async function main() {
  const bundle = loadSeedBundle(env.SEED_PATH);
  const { consent } = loadConfig(deploymentConfigSchema, 'deployment.json');
  await runSeed(env.DATABASE_URL, bundle, env.MEDIA_ROOT, {
    consent,
    pictures: env.SEED_PICTURES,
  });
  console.log(`Seeded from ${env.SEED_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
