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
  example: 'DE123456789',
};

describe('loadCompanyIdRule', () => {
  const original = process.env['DEPLOYMENT_CONFIG_FILE'];

  afterEach(() => {
    process.env['DEPLOYMENT_CONFIG_FILE'] = original;
    resetApiDeploymentConfig();
  });

  it('applies the deployment pattern to the normalized value', () => {
    withConfig({ companyIdInput: { formats: [vat] } });
    const matches = loadCompanyIdRule();

    // The whole number as it is printed, which is what a customer types and
    // what the contract has already normalized by the time it arrives here.
    expect(matches('DE123456789')).toBe(true);
    expect(matches('123456789')).toBe(false);
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
          {
            key: 'sole',
            label: 'Sole trader',
            pattern: '^[0-9]{10}$',
            example: '1234567890',
          },
          {
            key: 'company',
            label: 'Company',
            pattern: '^[0-9]{12}$',
            example: '123456789012',
          },
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
      companyIdInput: {
        formats: [{ key: 'x', pattern: '\\d{9}', example: '123456789' }],
      },
    });

    expect(() => loadApiDeploymentConfig()).toThrow(/anchored/);
  });

  it('refuses an oversized pattern at boot', () => {
    withConfig({
      companyIdInput: {
        formats: [{ key: 'x', pattern: `^${'a'.repeat(200)}$`, example: 'a' }],
      },
    });

    expect(() => loadApiDeploymentConfig()).toThrow(/too long/);
  });

  /**
   * The example is the field's only hint and the only thing an error message
   * can name, so it is checked against the pattern it claims to illustrate —
   * otherwise the form teaches a value it will then refuse.
   */
  describe('the config self-check', () => {
    it('refuses an example that its own pattern rejects', () => {
      withConfig({
        companyIdInput: { formats: [{ ...vat, example: 'DE12345' }] },
      });

      expect(() => loadApiDeploymentConfig()).toThrow(/does not match/);
    });

    it('refuses an unnamed format once there is more than one to pick', () => {
      withConfig({
        companyIdInput: {
          formats: [
            vat,
            { key: 'other', pattern: '^[0-9]{10}$', example: '1234567890' },
          ],
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
