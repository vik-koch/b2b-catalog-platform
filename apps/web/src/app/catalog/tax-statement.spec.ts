import { TestBed } from '@angular/core/testing';
import { TaxConfig } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { useTaxStatement } from './tax-statement';

function statement(tax: TaxConfig) {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: { ...defaultDeploymentConfig, tax },
      },
    ],
  });
  return TestBed.runInInjectionContext(() => useTaxStatement());
}

const text = defaultAppText.tax;

describe('useTaxStatement', () => {
  it('names the default rate under a total and beside a price', () => {
    const tax = statement({
      basis: 'included',
      rate: 5.5,
      statedAtPrices: true,
    });

    // The demo writes numbers the German way.
    expect(tax.total()).toBe(text.statement.included.replace('{rate}', '5,5'));
    expect(tax.atPrice()).toBe(tax.total());
    expect(tax.listing()).toBe(text.listing.included);
  });

  it('states the basis only under totals where the deployment says nothing at prices', () => {
    const tax = statement({ basis: 'added', rate: 19, statedAtPrices: false });

    expect(tax.total()).toBe(text.statement.added.replace('{rate}', '19'));
    expect(tax.atPrice()).toBeNull();
    expect(tax.listing()).toBeNull();
  });

  it('says no tax is charged under a total, and nothing at a price', () => {
    const tax = statement({ basis: 'none' });

    expect(tax.total()).toBe(text.statement.none);
    expect(tax.atPrice()).toBeNull();
    expect(tax.listing()).toBeNull();
  });
});
