import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { AppText } from '../config/app-text.type';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { EditModeService } from '../admin/edit-mode.service';
import { ConditionsPage } from './conditions-page';
import { PageService } from './page.service';

const conditionsBody = {
  title: 'Payment & delivery',
  bodyHtml: '<p>Invoices are payable within 14 days.</p>',
  updatedAt: '2026-09-30T10:00:00.000Z',
};

async function render(
  overrides: Partial<DeploymentConfig> = {},
  getPage: () => Promise<typeof conditionsBody | null> = async () =>
    conditionsBody,
  conditionsText: Partial<AppText['conditions']> = {},
) {
  TestBed.configureTestingModule({
    imports: [ConditionsPage],
    providers: [
      provideRouter([]),
      {
        provide: APP_TEXT,
        useValue: {
          ...defaultAppText,
          conditions: { ...defaultAppText.conditions, ...conditionsText },
        },
      },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: { ...defaultDeploymentConfig, ...overrides },
      },
      { provide: PageService, useValue: { getPage } },
      {
        provide: EditModeService,
        useValue: {
          enabled: () => false,
          settled: () => true,
          registerEditable: () => () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConditionsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const fulfilment = defaultAppText.checkout.fulfilment;
const payment = defaultAppText.checkout.payment;

describe('ConditionsPage', () => {
  it('renders the body, then the zones, pickup points and payment methods', async () => {
    const el = await render();

    expect(el.querySelector('h1')?.textContent).toContain('Payment & delivery');
    expect(el.querySelector('.prose')?.innerHTML).toContain('14 days');

    const text = el.textContent ?? '';
    for (const zone of defaultDeploymentConfig.delivery?.zones ?? []) {
      expect(text).toContain(zone.title);
    }
    for (const point of defaultDeploymentConfig.pickup?.locations ?? []) {
      expect(text).toContain(point.name);
      expect(text).toContain(point.address);
    }
    expect(text).toContain(payment.cashTitle);
    expect(text).toContain(payment.cashPersonOnly);
    expect(text).toContain(payment.transferTitle);
    expect(text).toContain(payment.transferCompanyOnly);
  });

  it('leaves out the zones and pickup where the deployment has none', async () => {
    const el = await render({ delivery: undefined, pickup: undefined });

    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.join()).not.toContain(fulfilment.conditionsHeading);
    expect(headings.join()).not.toContain(fulfilment.pickupTitle);
    // Payment is the platform's rule, so it is there whatever is configured.
    expect(headings.join()).toContain(defaultAppText.conditions.paymentHeading);
  });

  it('falls back to the nav label while the page has no stored title', async () => {
    const el = await render({}, async () => ({ ...conditionsBody, title: '' }));

    expect(el.querySelector('h1')?.textContent).toContain(
      defaultAppText.nav['conditions'],
    );
  });

  it('shows the load error instead of a half page when the body fails', async () => {
    const el = await render({}, () => Promise.reject(new Error('down')));

    expect(el.textContent).toContain(defaultAppText.errors.cannotLoadTitle);
    expect(el.textContent).not.toContain(payment.cashTitle);
  });

  it('shows the load error when the page has no body yet', async () => {
    const el = await render({}, async () => null);

    expect(el.textContent).toContain(defaultAppText.errors.cannotLoadTitle);
    expect(el.textContent).not.toContain(payment.cashTitle);
  });

  it('states the tax basis with the default rate', async () => {
    const el = await render({
      tax: { basis: 'added', rate: 7, statedAtPrices: false },
    });

    expect(el.textContent).toContain(
      defaultAppText.conditions.taxAdded.replace('{rate}', '7'),
    );
  });

  it('says no tax is charged under `none`', async () => {
    const el = await render({ tax: { basis: 'none' } });

    expect(el.textContent).toContain(defaultAppText.conditions.taxNone);
  });

  it('puts the goods paragraphs before the tax sentence, bold kept', async () => {
    const el = await render({}, undefined, {
      goodsParagraphs: ['Sold <b>assorted</b>.', 'Second paragraph.'],
    });

    const section = [...el.querySelectorAll('section')].find((s) =>
      s
        .querySelector('h2')
        ?.textContent?.includes(defaultAppText.conditions.goodsHeading),
    );
    const paragraphs = [...(section?.querySelectorAll('p') ?? [])].map((p) =>
      p.textContent?.trim(),
    );
    expect(paragraphs.slice(0, 2)).toEqual([
      'Sold assorted.',
      'Second paragraph.',
    ]);
    expect(paragraphs[2]).toContain('VAT');
    expect(section?.querySelector('b')?.textContent).toBe('assorted');
  });

  it('states the tax basis even with no goods paragraphs', async () => {
    const el = await render({ tax: { basis: 'none' } }, undefined, {
      goodsParagraphs: [],
    });

    expect(el.textContent).toContain(defaultAppText.conditions.goodsHeading);
    expect(el.textContent).toContain(defaultAppText.conditions.taxNone);
  });

  it('links the withdrawal page under the returns where it is published', async () => {
    const el = await render({
      pages: { ...defaultDeploymentConfig.pages, published: ['withdrawal'] },
    });

    expect(el.textContent).toContain(defaultAppText.conditions.returnsHeading);
    expect(el.querySelector('a[href="/withdrawal"]')?.textContent?.trim()).toBe(
      defaultAppText.conditions.returnsWithdrawalLink,
    );
  });

  it('leaves out the returns with no paragraphs and no withdrawal page', async () => {
    const el = await render(
      { pages: { ...defaultDeploymentConfig.pages, published: [] } },
      undefined,
      { returnsParagraphs: [] },
    );

    expect(el.textContent).not.toContain(
      defaultAppText.conditions.returnsHeading,
    );
  });
});
