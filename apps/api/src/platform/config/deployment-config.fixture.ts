import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetApiDeploymentConfig } from './deployment-config';

/** The committed demo file: every key the strict schema requires, so a test
 * states only what it is about. An `undefined` drops a key. */
const demo = JSON.parse(
  readFileSync('deployments/fixture/config/deployment.json', 'utf8'),
);

/** Points CONFIG_PATH at a directory holding a config written for this test. */
export function withConfig(config: Record<string, unknown>): void {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-'));
  writeFileSync(
    join(dir, 'deployment.json'),
    JSON.stringify({ ...demo, ...config }),
  );
  process.env['CONFIG_PATH'] = dir;
  resetApiDeploymentConfig();
}
