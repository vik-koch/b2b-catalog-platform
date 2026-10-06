#!/usr/bin/env node
/**
 * Writes the deployment config the api-e2e run serves: the demo's own, with
 * both consents switched on.
 *
 * The demo deployment asks for no consent, which is the right answer for the
 * shop it stands for, but the suite has to drive the forms that do. Derived
 * rather than committed as a second file, so the two cannot drift: everything
 * but the switch is the demo's, read fresh on every run.
 *
 * `assets/` is resolved beside the config file, so it is linked in, not copied.
 *
 * Run by `api:serve-e2e` before it starts; `.env.serve-e2e` points the API at
 * the result.
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SOURCE = 'config';
const OUT = 'tmp/api-e2e-config';

const config = JSON.parse(
  readFileSync(join(SOURCE, 'deployment.json'), 'utf8'),
);
config.consent = { contact: true, account: true };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'deployment.json'),
  JSON.stringify(config, null, 2) + '\n',
);
symlinkSync(
  relative(resolve(OUT), resolve(SOURCE, 'assets')),
  join(OUT, 'assets'),
);

console.log(`api-e2e config: wrote ${OUT}/deployment.json`);
