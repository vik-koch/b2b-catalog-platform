import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';

import { defaultSharedOrderingText } from '../../../core/ordering/ordering-text.fixture';
import { PageService } from '../../../core/site/page.service';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { defaultSharedText } from '../../../platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../../platform/config/storefront-text.fixture';
import { EditModeService } from '../../../platform/edit-mode/edit-mode.service';
import { defaultStorefrontOrderingText } from '../ordering-text.fixture';
import type { StorefrontOrderingText } from '../ordering-text.type';
import { ConditionsPage } from './conditions-page';

const conditionsBody = {
  title: 'Payment & delivery',
  bodyHtml: '<p>Invoices are payable within 14 days.</p>',
  updatedAt: '2026-09-30T10:00:00.000Z',
};

async function render(
  overrides: Partial<DeploymentConfigFile> = {},
  getPage: () => Promise<typeof conditionsBody | null> = async () =>
    conditionsBody,
  conditionsText: Partial<StorefrontOrderingText['conditions']> = {},
) {
  TestBed.configureTestingModule({
    imports: [ConditionsPage],
    providers: [
      provideRouter([]),
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      {
        provide: STOREFRONT_TEXT,
        useValue: {
          ...defaultStorefrontText,
          ordering: {
            ...defaultStorefrontOrderingText,
            conditions: {
              ...defaultStorefrontOrderingText.conditions,
              ...conditionsText,
            },
          },
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

const fulfilment = defaultStorefrontOrderingText.checkout.fulfilment;
const payment = defaultStorefrontOrderingText.checkout.payment;
const paymentNames = defaultSharedOrderingText.order.paymentMethods;

describe('ConditionsPage', () => {
  it('renders the body, then the zones, pickup points and payment methods', async () => {
    const el = await render();

    expect(el.querySelector('h1')?.textContent).toContain('Payment & delivery');
    expect(el.querySelector('.prose')?.innerHTML).toContain('14 days');

    expect(el.querySelector('section app-delivery-zone-list')).not.toBeNull();
    const text = el.textContent ?? '';
    for (const point of defaultDeploymentConfig.ordering.pickup?.locations ??
      []) {
      expect(text).toContain(point.name);
      expect(text).toContain(point.address);
    }
    expect(text).toContain(paymentNames.cash);
    expect(text).toContain(payment.cashPersonOnly);
    expect(text).toContain(paymentNames.transfer);
    expect(text).toContain(payment.transferCompanyOnly);
  });

  it('leaves out the zones and pickup where the deployment has none', async () => {
    const el = await render({
      ordering: {
        ...defaultDeploymentConfig.ordering,
        delivery: undefined,
        pickup: undefined,
      },
    });

    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.join()).not.toContain(fulfilment.conditionsHeading);
    expect(el.querySelector('app-delivery-zone-list')).toBeNull();
    expect(headings.join()).not.toContain(
      defaultSharedOrderingText.fulfilment.pickup,
    );
    // Payment is the platform's rule, so it is there whatever is configured.
    expect(headings.join()).toContain(
      defaultStorefrontOrderingText.conditions.paymentHeading,
    );
  });

  it('falls back to the nav label while the page has no stored title', async () => {
    const el = await render({}, async () => ({ ...conditionsBody, title: '' }));

    expect(el.querySelector('h1')?.textContent).toContain(
      defaultSharedText.nav['conditions'],
    );
  });

  it('shows the load error instead of a half page when the body fails', async () => {
    const el = await render({}, () => Promise.reject(new Error('down')));

    expect(el.textContent).toContain(
      defaultStorefrontText.errors.cannotLoadTitle,
    );
    expect(el.textContent).not.toContain(paymentNames.cash);
  });

  it('shows the load error when the page has no body yet', async () => {
    const el = await render({}, async () => null);

    expect(el.textContent).toContain(
      defaultStorefrontText.errors.cannotLoadTitle,
    );
    expect(el.textContent).not.toContain(paymentNames.cash);
  });

  it('states the tax basis with the default rate', async () => {
    const el = await render({
      catalog: {
        ...defaultDeploymentConfig.catalog,
        tax: { basis: 'added', rate: 7, statedAtPrices: false },
      },
    });

    expect(el.textContent).toContain(
      defaultStorefrontOrderingText.conditions.taxAdded.replace('{rate}', '7'),
    );
  });

  it('says no tax is charged under `none`', async () => {
    const el = await render({
      catalog: { ...defaultDeploymentConfig.catalog, tax: { basis: 'none' } },
    });

    expect(el.textContent).toContain(
      defaultStorefrontOrderingText.conditions.taxNone,
    );
  });

  it('puts the goods paragraphs before the tax sentence, bold kept', async () => {
    const el = await render({}, undefined, {
      goodsParagraphs: ['Sold <b>assorted</b>.', 'Second paragraph.'],
    });

    const section = [...el.querySelectorAll('section')].find((s) =>
      s
        .querySelector('h2')
        ?.textContent?.includes(
          defaultStorefrontOrderingText.conditions.goodsHeading,
        ),
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
    const el = await render(
      {
        catalog: { ...defaultDeploymentConfig.catalog, tax: { basis: 'none' } },
      },
      undefined,
      { goodsParagraphs: [] },
    );

    expect(el.textContent).toContain(
      defaultStorefrontOrderingText.conditions.goodsHeading,
    );
    expect(el.textContent).toContain(
      defaultStorefrontOrderingText.conditions.taxNone,
    );
  });

  it('links the withdrawal page under the returns where it is published', async () => {
    const el = await render({
      site: {
        ...defaultDeploymentConfig.site,
        pages: {
          ...defaultDeploymentConfig.site.pages,
          published: ['withdrawal'],
        },
      },
    });

    expect(el.textContent).toContain(
      defaultStorefrontOrderingText.conditions.returnsHeading,
    );
    expect(el.querySelector('a[href="/withdrawal"]')?.textContent?.trim()).toBe(
      defaultStorefrontOrderingText.conditions.returnsWithdrawalLink,
    );
  });

  it('leaves out the returns with no paragraphs and no withdrawal page', async () => {
    const el = await render(
      {
        site: {
          ...defaultDeploymentConfig.site,
          pages: { ...defaultDeploymentConfig.site.pages, published: [] },
        },
      },
      undefined,
      { returnsParagraphs: [] },
    );

    expect(el.textContent).not.toContain(
      defaultStorefrontOrderingText.conditions.returnsHeading,
    );
  });
});
