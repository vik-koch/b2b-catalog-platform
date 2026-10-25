import { deploymentConfigSchema } from '@b2b-catalog-platform/shared';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';

/**
 * The `pages` block is the one part of the config where two fields can
 * contradict each other. Config is load-whole-or-die, so the contradiction has
 * to be caught at boot — a nav entry pointing at an unpublished page would
 * otherwise render a link to a 404 into the chrome of every page.
 */
function parse(pages: Record<string, unknown>) {
  return deploymentConfigSchema.safeParse({
    ...defaultDeploymentConfig,
    pages: { ...defaultDeploymentConfig.pages, ...pages },
  });
}

describe('deploymentConfigSchema — pages', () => {
  it('accepts the shipped demo config', () => {
    expect(
      deploymentConfigSchema.safeParse(defaultDeploymentConfig).success,
    ).toBe(true);
  });

  it('accepts a page that is published but linked from neither nav', () => {
    const result = parse({
      published: ['about', 'conditions', 'privacy', 'imprint', 'contact'],
      headerNav: ['about'],
      footerNav: ['conditions'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a footer link to an unpublished page', () => {
    const result = parse({
      published: ['about', 'conditions', 'privacy', 'contact'],
      footerNav: ['conditions', 'privacy', 'imprint'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not published');
    expect(result.error?.issues[0]?.path).toEqual(['pages', 'footerNav']);
  });

  it('rejects a header link to an unpublished page', () => {
    const result = parse({
      published: ['conditions', 'privacy', 'imprint', 'contact'],
      headerNav: ['about', 'contact'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['pages', 'headerNav']);
  });

  it('rejects a slug that is not a known page', () => {
    const result = parse({ published: ['about', 'careers'] });

    expect(result.success).toBe(false);
  });
});

/**
 * The notice's link is followed from a mail as well as from a page, and a mail
 * has no page to resolve a path against.
 */
describe('deploymentConfigSchema — notice', () => {
  const parseNotice = (notice: unknown) =>
    deploymentConfigSchema.safeParse({ ...defaultDeploymentConfig, notice });

  it('accepts a notice with an absolute link', () => {
    const result = parseNotice({
      text: 'A demonstration shop.',
      link: { label: 'About this demo', url: 'https://example.com/demo' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a link that is only a path', () => {
    const result = parseNotice({
      text: 'A demonstration shop.',
      link: { label: 'About this demo', url: '/pages/about' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['notice', 'link', 'url']);
  });

  it('rejects a link to anything but the web', () => {
    const result = parseNotice({
      text: 'A demonstration shop.',
      link: { label: 'Write to us', url: 'mailto:hello@example.com' },
    });

    expect(result.success).toBe(false);
  });
});
