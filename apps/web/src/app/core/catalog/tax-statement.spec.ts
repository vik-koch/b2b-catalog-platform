import { SHARED_TEXT } from '../../shared/config/shared-text';
import { defaultSharedText } from '../../shared/config/shared-text.fixture';
import { TestBed } from '@angular/core/testing';
import { TaxConfig } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../shared/config/storefront-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { useTaxStatement } from './tax-statement';

function statement(tax: TaxConfig) {
  TestBed.configureTestingModule({
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: { ...defaultDeploymentConfig, tax },
      },
    ],
  });
  return TestBed.runInInjectionContext(() => useTaxStatement());
}

const text = defaultStorefrontText.tax;

describe('useTaxStatement', () => {
  it('names the default rate under a total and beside a price', () => {
    const tax = statement({
      basis: 'included',
      rate: 5.5,
      statedAtPrices: true,
    });

    // The demo writes numbers the German way.
    expect(tax.total([])).toBe(
      defaultSharedText.tax.included.replace('{rate}', '5,5'),
    );
    // Beside a price the demo adds that delivery comes on top; under a
    // total it does not, since a pickup order has none.
    expect(tax.atPrice(null)).toBe(
      text.atPrice?.replace('{statement}', tax.total([])),
    );
    expect(tax.listing()).toBe(text.listing.included);
  });

  it('names a product’s own rate beside its price', () => {
    const tax = statement({
      basis: 'included',
      rate: 19,
      statedAtPrices: true,
    });

    expect(tax.atPrice(7)).toContain(
      defaultSharedText.tax.included.replace('{rate}', '7'),
    );
  });

  it('says the statement alone beside a price where nothing is added to it', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: STOREFRONT_TEXT,
          useValue: {
            ...defaultStorefrontText,
            tax: { ...defaultStorefrontText.tax, atPrice: undefined },
          },
        },
        { provide: SHARED_TEXT, useValue: defaultSharedText },
        {
          provide: DEPLOYMENT_CONFIG,
          useValue: {
            ...defaultDeploymentConfig,
            tax: { basis: 'included', rate: 19, statedAtPrices: true },
          },
        },
      ],
    });
    const tax = TestBed.runInInjectionContext(() => useTaxStatement());

    expect(tax.atPrice(7)).toBe(
      defaultSharedText.tax.included.replace('{rate}', '7'),
    );
  });

  it('states the basis only under totals where the deployment says nothing at prices', () => {
    const tax = statement({ basis: 'added', rate: 19, statedAtPrices: false });

    expect(tax.total([])).toBe(
      defaultSharedText.tax.added.replace('{rate}', '19'),
    );
    expect(tax.atPrice(7)).toBeNull();
    expect(tax.listing()).toBeNull();
  });

  it('says no tax is charged under a total, and nothing at a price', () => {
    const tax = statement({ basis: 'none' });

    expect(tax.total([])).toBe(defaultSharedText.tax.none);
    expect(tax.atPrice(7)).toBeNull();
    expect(tax.listing()).toBeNull();
  });

  it('names the rate the lines share, and only the basis once they differ', () => {
    const tax = statement({
      basis: 'included',
      rate: 19,
      statedAtPrices: true,
    });

    expect(tax.total([7, 7])).toBe(
      defaultSharedText.tax.included.replace('{rate}', '7'),
    );
    expect(tax.perLine([7, 7])).toBe(false);

    expect(tax.total([7, 19])).toBe(defaultSharedText.tax.mixed.included);
    expect(tax.perLine([7, 19])).toBe(true);
    expect(tax.line(7)).toBe(defaultSharedText.tax.line.replace('{rate}', '7'));
  });

  it('states an order on the basis it was submitted under, not today’s', () => {
    const tax = statement({ basis: 'none' });

    expect(tax.total([7, 19], 'added')).toBe(defaultSharedText.tax.mixed.added);
    expect(tax.perLine([7, 19], 'added')).toBe(true);
    expect(tax.perLine([null, null], 'none')).toBe(false);
  });
});
