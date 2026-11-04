import { resetApiDeploymentConfig } from '../../platform/config/deployment-config';
import {
  demoDeployment,
  withConfig,
} from '../../platform/config/deployment-config.fixture';
import { loadConsentPurposesAsked } from './site-config';

/** The demo config with the site's block changed. */
const withSite = (site: Record<string, unknown>) =>
  withConfig({ site: { ...demoDeployment.site, ...site } });

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
    withSite({ consent: { contact: true, account: false } });

    expect(loadConsentPurposesAsked()).toEqual(['contact']);
  });

  it('asks for nothing where both are off', () => {
    withSite({ consent: { contact: false, account: false } });

    expect(loadConsentPurposesAsked()).toEqual([]);
  });

  // Both are stated: leaving one out is a decision nobody made.
  it('refuses a config that leaves a purpose unstated', () => {
    withSite({ consent: { contact: true } });

    expect(() => loadConsentPurposesAsked()).toThrow();
  });

  it('refuses a consent text listed as a published page', () => {
    withSite({ pages: pages(['privacy', 'consent-contact']) });

    expect(() => loadConsentPurposesAsked()).toThrow(/switched by consent/);
  });
});
