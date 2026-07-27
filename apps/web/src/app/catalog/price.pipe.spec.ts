import { TestBed } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { PricePipe } from './price.pipe';

const norm = (s: string): string => s.replace(/ /g, ' ');

function pipeWithCurrency(code: string, locale: string): PricePipe {
  const config = {
    catalog: { currency: { code, locale } },
  } as unknown as DeploymentConfig;
  TestBed.configureTestingModule({
    providers: [PricePipe, { provide: DEPLOYMENT_CONFIG, useValue: config }],
  });
  return TestBed.inject(PricePipe);
}

describe('PricePipe', () => {
  it('formats using the deployment currency and locale', () => {
    expect(norm(pipeWithCurrency('EUR', 'de-DE').transform(1890))).toBe(
      '18,90 €',
    );
  });

  it('respects a different configured currency', () => {
    expect(pipeWithCurrency('USD', 'en-US').transform(2500)).toBe('$25.00');
  });
});
