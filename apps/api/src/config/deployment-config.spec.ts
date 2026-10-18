import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadApiDeploymentConfig,
  loadCompanyIdRule,
  loadConsentPurposesAsked,
  resetApiDeploymentConfig,
} from './deployment-config';

/** The pages section with only `published` set, and no links. */
const pages = (published: string[]) => ({
  published,
  headerNav: [],
  footerNav: [],
});

/** The committed demo file: every key the strict schema requires, so a test
 * states only what it is about. An `undefined` drops a key. */
const demo = JSON.parse(readFileSync('config/deployment.json', 'utf8'));

/** Points CONFIG_PATH at a directory holding a config written for this test. */
function withConfig(config: Record<string, unknown>): void {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-'));
  writeFileSync(
    join(dir, 'deployment.json'),
    JSON.stringify({ ...demo, ...config }),
  );
  process.env['CONFIG_PATH'] = dir;
  resetApiDeploymentConfig();
}

const vat = {
  key: 'vat',
  pattern: '^DE[0-9]{9}$',
  example: 'DE123456789',
};

describe('loadCompanyIdRule', () => {
  const original = process.env['CONFIG_PATH'];

  afterEach(() => {
    process.env['CONFIG_PATH'] = original;
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
    withConfig({ companyIdInput: undefined });

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

describe('loadConsentPurposesAsked', () => {
  const original = process.env['CONFIG_PATH'];

  afterEach(() => {
    process.env['CONFIG_PATH'] = original;
    resetApiDeploymentConfig();
  });

  it('asks for the purposes switched on', () => {
    withConfig({ consent: { contact: true, account: false } });

    expect(loadConsentPurposesAsked()).toEqual(['contact']);
  });

  it('asks for nothing where both are off', () => {
    withConfig({ consent: { contact: false, account: false } });

    expect(loadConsentPurposesAsked()).toEqual([]);
  });

  // Both are stated: leaving one out is a decision nobody made.
  it('refuses a config that leaves a purpose unstated', () => {
    withConfig({ consent: { contact: true } });

    expect(() => loadConsentPurposesAsked()).toThrow();
  });

  it('refuses a consent text listed as a published page', () => {
    withConfig({ pages: pages(['privacy', 'consent-contact']) });

    expect(() => loadConsentPurposesAsked()).toThrow(/switched by consent/);
  });
});
