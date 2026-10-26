import { deploymentConfigSchema } from '@b2b-catalog-platform/shared';
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

describe('deploymentConfigSchema — theme', () => {
  const parseTheme = (theme: Record<string, unknown>) =>
    deploymentConfigSchema.safeParse({
      ...defaultDeploymentConfig,
      branding: {
        ...defaultDeploymentConfig.branding,
        theme: { ...defaultDeploymentConfig.branding.theme, ...theme },
      },
    });
  const pathOf = (result: ReturnType<typeof parseTheme>) =>
    result.error?.issues[0]?.path.slice(2);

  // Tailwind's own shades, the stylesheet's defaults.
  const danger = {
    base: '#c10007',
    hover: '#9f0712',
    press: '#82181a',
    ink: '#9f0712',
    surface: '#ffe2e2',
    edge: '#ffc9c9',
    edgeStrong: '#ffa2a2',
    dot: '#e7000b',
  };
  const warning = {
    base: '#bb4d00',
    ink: '#973c00',
    surface: '#fef3c6',
    edge: '#fee685',
    dot: '#e17100',
  };

  it('takes the brand alone, every other colour keeping its default', () => {
    const { primary, secondary, accent } =
      defaultDeploymentConfig.branding.theme;
    const result = deploymentConfigSchema.safeParse({
      ...defaultDeploymentConfig,
      branding: {
        ...defaultDeploymentConfig.branding,
        theme: { primary, secondary, accent },
      },
    });

    expect(result.success).toBe(true);
  });

  it('takes a grey role by its own name', () => {
    expect(parseTheme({ surfaceStrong: '#e2e8f0' }).success).toBe(true);
  });

  it('refuses the grey ramp it replaced', () => {
    expect(parseTheme({ neutrals: { 100: '#f1f5f9' } }).success).toBe(false);
  });

  it('accepts a status colour set whole', () => {
    expect(parseTheme({ danger, warning }).success).toBe(true);
  });

  it('refuses a status colour with a role left out, naming the role', () => {
    const { edge: _, ...partial } = warning;
    const result = parseTheme({ warning: partial });

    expect(result.success).toBe(false);
    expect(pathOf(result)).toEqual(['warning', 'edge']);
  });

  it('refuses text too light for the ground it is drawn on', () => {
    // Amber's 500 as the text on its own tint.
    const result = parseTheme({ warning: { ...warning, ink: '#fe9a00' } });

    expect(result.success).toBe(false);
    expect(pathOf(result)).toEqual(['warning', 'ink']);
  });

  it('refuses a danger fill too light for a white label', () => {
    const result = parseTheme({ danger: { ...danger, press: '#ffa2a2' } });

    expect(result.success).toBe(false);
    expect(pathOf(result)).toEqual(['danger', 'press']);
  });

  it('measures status text against the deployment’s own recessed ground', () => {
    expect(
      parseTheme({ danger, surface: '#d6d3d1' }).error?.issues[0]?.path,
    ).toEqual(['branding', 'theme', 'danger', 'base']);
  });

  it('takes only #rrggbb in a status colour, the form the check measures', () => {
    expect(parseTheme({ danger: { ...danger, base: 'red' } }).success).toBe(
      false,
    );
  });
});
