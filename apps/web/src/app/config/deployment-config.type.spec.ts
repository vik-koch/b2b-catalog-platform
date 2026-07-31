import { deploymentConfigSchema } from './deployment-config.type';
import { defaultDeploymentConfig } from './deployment-config.fixture';

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
