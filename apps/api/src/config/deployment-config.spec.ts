import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCompanyIdRule,
  resetApiDeploymentConfig,
} from './deployment-config';

const branding = { name: 'Shop', theme: { primary: '#000000' } };

/** Points DEPLOYMENT_CONFIG_FILE at a config written for this test. */
function withConfig(config: Record<string, unknown>): void {
  const file = join(mkdtempSync(join(tmpdir(), 'deployment-')), 'config.json');
  writeFileSync(file, JSON.stringify({ branding, ...config }));
  process.env['DEPLOYMENT_CONFIG_FILE'] = file;
  resetApiDeploymentConfig();
}

describe('loadCompanyIdRule', () => {
  const original = process.env['DEPLOYMENT_CONFIG_FILE'];

  afterEach(() => {
    process.env['DEPLOYMENT_CONFIG_FILE'] = original;
    resetApiDeploymentConfig();
  });

  it('applies the deployment pattern to the canonical value', () => {
    withConfig({ companyIdInput: { prefix: 'DE', pattern: '^DE[0-9]{9}$' } });
    const matches = loadCompanyIdRule();

    // The prefix is shown rather than typed, but it is part of what is stored,
    // so the pattern covers it — and the browser sends it that way.
    expect(matches('DE123456789')).toBe(true);
    expect(matches('123456789')).toBe(false);
    // The mask's grouping is the browser's business; what arrives is bare.
    expect(matches('DE123 456 789')).toBe(false);
  });

  // Without a configured format there is no format rule — the contract's
  // envelope (present, trimmed, length-capped) is all that applies.
  it('accepts anything when the deployment configures no pattern', () => {
    withConfig({});

    expect(loadCompanyIdRule()('whatever-123')).toBe(true);
  });

  // The pattern is trusted (a deployment owner wrote it) but still compiled
  // against user input, so the boot refuses one that could run away.
  it('refuses an unanchored pattern at boot', () => {
    withConfig({ companyIdInput: { pattern: '\\d{9}' } });

    expect(() => loadCompanyIdRule()).toThrow(/anchored/);
  });

  it('refuses an oversized pattern at boot', () => {
    withConfig({ companyIdInput: { pattern: `^${'a'.repeat(200)}$` } });

    expect(() => loadCompanyIdRule()).toThrow(/too long/);
  });
});
