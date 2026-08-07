import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadApiDeploymentConfig,
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

const vat = {
  key: 'vat',
  pattern: '^DE[0-9]{9}$',
  prefix: 'DE',
  mask: '#########',
  example: 'DE123456789',
};

describe('loadCompanyIdRule', () => {
  const original = process.env['DEPLOYMENT_CONFIG_FILE'];

  afterEach(() => {
    process.env['DEPLOYMENT_CONFIG_FILE'] = original;
    resetApiDeploymentConfig();
  });

  it('applies the deployment pattern to the canonical value', () => {
    withConfig({ companyIdInput: { formats: [vat] } });
    const matches = loadCompanyIdRule();

    // The prefix is shown rather than typed, but it is part of what is stored,
    // so the pattern covers it — and the browser sends it that way.
    expect(matches('DE123456789')).toBe(true);
    expect(matches('123456789')).toBe(false);
    // The mask's grouping is the browser's business; what arrives is bare.
    expect(matches('DE123 456 789')).toBe(false);
  });

  /**
   * The point of several formats: a jurisdiction that accepts a ten-digit
   * number from a sole trader and a twelve-digit one from a company accepts
   * both, and the API does not care which the browser's picker was set to.
   */
  it('accepts a value matching any configured format', () => {
    withConfig({
      companyIdInput: {
        formats: [
          { key: 'sole', label: 'Sole trader', pattern: '^[0-9]{10}$' },
          { key: 'company', label: 'Company', pattern: '^[0-9]{12}$' },
        ],
      },
    });
    const matches = loadCompanyIdRule();

    expect(matches('1234567890')).toBe(true);
    expect(matches('123456789012')).toBe(true);
    // Eleven is neither, which is exactly what having two shapes must not mean.
    expect(matches('12345678901')).toBe(false);
  });

  // Without a configured format there is no format rule — the contract's
  // envelope (present, trimmed, length-capped) is all that applies.
  it('accepts anything when the deployment configures no pattern', () => {
    withConfig({});

    expect(loadCompanyIdRule()('whatever-123')).toBe(true);
  });

  // A pattern is trusted (a deployment owner wrote it) but still compiled
  // against user input, so the boot refuses one that could run away.
  it('refuses an unanchored pattern at boot', () => {
    withConfig({
      companyIdInput: { formats: [{ key: 'x', pattern: '\\d{9}' }] },
    });

    expect(() => loadApiDeploymentConfig()).toThrow(/anchored/);
  });

  it('refuses an oversized pattern at boot', () => {
    withConfig({
      companyIdInput: {
        formats: [{ key: 'x', pattern: `^${'a'.repeat(200)}$` }],
      },
    });

    expect(() => loadApiDeploymentConfig()).toThrow(/too long/);
  });

  /**
   * `prefix` and `mask` are promises about a pattern that no regex can be asked
   * to confirm, so the example is checked against all three. Each of these
   * would otherwise ship a field nobody can fill in.
   */
  describe('the config self-check', () => {
    it('refuses a mask that does not fit the format it is on', () => {
      withConfig({
        companyIdInput: { formats: [{ ...vat, mask: '############' }] },
      });

      expect(() => loadApiDeploymentConfig()).toThrow(/mask takes 12 digits/);
    });

    it('refuses an example that its own pattern rejects', () => {
      withConfig({
        companyIdInput: { formats: [{ ...vat, example: 'DE12345' }] },
      });

      expect(() => loadApiDeploymentConfig()).toThrow(/does not match/);
    });

    it('refuses an unnamed format once there is more than one to pick', () => {
      withConfig({
        companyIdInput: {
          formats: [vat, { key: 'other', pattern: '^[0-9]{10}$' }],
        },
      });

      expect(() => loadApiDeploymentConfig()).toThrow(/label is required/);
    });

    it('asks for no label while there is nothing to pick between', () => {
      withConfig({ companyIdInput: { formats: [vat] } });

      expect(() => loadApiDeploymentConfig()).not.toThrow();
    });
  });
});
