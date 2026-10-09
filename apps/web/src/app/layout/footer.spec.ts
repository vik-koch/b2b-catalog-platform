import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { Footer } from './footer';

function config(cookieConsentEnabled: boolean): DeploymentConfig {
  return { ...defaultDeploymentConfig, cookieConsentEnabled };
}

async function render(enabled: boolean) {
  return renderWith(config(enabled));
}

async function renderWith(deployment: DeploymentConfig) {
  TestBed.configureTestingModule({
    imports: [Footer],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: deployment },
    ],
  });
  const fixture = TestBed.createComponent(Footer);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function buttonLabels(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('button')).map(
    (b) => b.textContent?.trim() ?? '',
  );
}

describe('Footer', () => {
  beforeEach(() => localStorage.clear());

  it('shows the "Cookie settings" control when consent is enabled', async () => {
    const el = await render(true);
    expect(buttonLabels(el)).toContain(defaultAppText.consent.settings);
  });

  it('hides the "Cookie settings" control when consent is disabled', async () => {
    const el = await render(false);
    expect(buttonLabels(el)).not.toContain(defaultAppText.consent.settings);
  });

  it('renders the copyright as a range ending in the current year', async () => {
    const el = await render(false);
    const { name, startYear } = defaultDeploymentConfig.branding;
    expect(el.textContent).toContain(
      `© ${name} ${startYear}–${new Date().getFullYear()}`,
    );
  });

  it('always renders the legal nav links', async () => {
    const el = await render(false);
    expect(el.textContent).toContain(defaultAppText.nav['privacy']);
    expect(el.textContent).toContain(defaultAppText.nav['imprint']);
  });

  // The attribution page is a code route, not a published page, so the only
  // thing that decides whether it is advertised is its place in footerNav — a
  // deployment with no obligation to show it drops it there.
  it('links the license notice when the deployment lists it', async () => {
    const el = await render(false);
    expect(el.textContent).toContain(defaultAppText.nav['licenses']);
  });

  // FR-NAV-07. The mark is a mask, so the link's words are what identifies it;
  // the icon file reaches CSS as a custom property on the span beside them.
  it('links the places the deployment also exists, in configured order', async () => {
    const el = await render(false);
    const configured = defaultDeploymentConfig.elsewhere ?? [];
    expect(configured.length).toBeGreaterThan(0);

    const links = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('a[rel="noopener noreferrer"]'),
    );
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      configured.map((link) => link.url),
    );
    expect(links.map((a) => a.textContent?.trim())).toEqual(
      configured.map((link) => link.label),
    );
    expect(
      links.map((a) =>
        a
          .querySelector<HTMLElement>('.elsewhere-mark')
          ?.style.getPropertyValue('--elsewhere-icon'),
      ),
    ).toEqual(configured.map((link) => `url("/${link.icon}")`));
  });

  it("keeps each mark's room before its file arrives", async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      elsewhere: [
        { label: 'Square', url: 'https://a.example', icon: 'a.svg' },
        {
          label: 'Wide',
          url: 'https://b.example',
          icon: 'b.svg',
          width: 96,
          height: 24,
        },
      ],
    });
    const marks = Array.from(
      el.querySelectorAll<HTMLElement>('.elsewhere-mark'),
    );
    expect(marks.map((mark) => mark.style.aspectRatio)).toEqual([
      '1 / 1',
      '96 / 24',
    ]);
  });

  it('shows nothing beside the enquiry button when nothing is configured', async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      elsewhere: [],
    });
    expect(el.querySelector('.elsewhere-mark')).toBeNull();
  });

  // NFR-LEGAL-02. The line names the seller and their numbers, then reaches
  // them through the header's contact unless it has one of its own.
  it('names the seller with their numbers and contact, in that order', async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      seller: { name: 'Shop Ltd', registration: ['Reg 1', 'Tax 2'] },
      contact: { phone: '+49 40 123', email: 'hi@shop.example' },
    });
    const line = el.querySelector('address');
    const parts = Array.from(
      line?.querySelectorAll('.whitespace-nowrap') ?? [],
    ).map((part) => part.textContent?.trim());
    expect(parts).toEqual([
      'Shop Ltd',
      'Reg 1',
      'Tax 2',
      '+49 40 123',
      'hi@shop.example',
    ]);
    const hrefs = Array.from(line?.querySelectorAll('a') ?? []).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['tel:+4940123', 'mailto:hi@shop.example']);
    // The way to reach them is a line of its own, under who they are.
    expect(line?.querySelector('.block')?.textContent?.trim()).toMatch(
      /^\+49 40 123\s*·\s*hi@shop\.example$/,
    );
  });

  it('leaves the contact out of the seller line when none is configured', async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      seller: { name: 'Shop Ltd', registration: ['Reg 1'] },
      contact: undefined,
    });
    const line = el.querySelector('address');
    // One separator between the two parts, none left dangling after them.
    expect(line?.querySelectorAll('[aria-hidden="true"]').length).toBe(1);
    expect(line?.querySelector('a')).toBeNull();
  });

  it("uses the seller line's own contact in place of the header's", async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      seller: {
        name: 'Shop Ltd',
        registration: ['Reg 1'],
        contact: { email: 'legal@shop.example' },
      },
      contact: { phone: '+49 40 123', email: 'hi@shop.example' },
    });
    const hrefs = Array.from(
      el.querySelector('address')?.querySelectorAll('a') ?? [],
    ).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['mailto:legal@shop.example']);
  });

  it('shows no contact on the seller line when its own is empty', async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      seller: { name: 'Shop Ltd', registration: ['Reg 1'], contact: {} },
      contact: { phone: '+49 40 123', email: 'hi@shop.example' },
    });
    expect(el.querySelector('address a')).toBeNull();
  });

  it('shows no seller line when the deployment configures none', async () => {
    const el = await renderWith({
      ...defaultDeploymentConfig,
      seller: undefined,
    });
    expect(el.querySelector('address')).toBeNull();
  });

  it('omits the license notice link when the deployment drops it', async () => {
    const { pages } = defaultDeploymentConfig;
    const el = await renderWith({
      ...defaultDeploymentConfig,
      pages: {
        ...pages,
        footerNav: pages.footerNav.filter((segment) => segment !== 'licenses'),
      },
    });

    expect(el.textContent).not.toContain(defaultAppText.nav['licenses']);
  });
});
