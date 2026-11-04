import { resetApiDeploymentConfig } from '../../platform/config/deployment-config';
import { withConfig } from '../../platform/config/deployment-config.fixture';
import { loadConsentPurposesAsked } from './site-config';

/** The pages section with only `published` set, and no links. */
const pages = (published: string[]) => ({
  published,
  headerNav: [],
  footerNav: [],
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
