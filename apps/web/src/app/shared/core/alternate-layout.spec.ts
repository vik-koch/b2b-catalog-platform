import { TestBed } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AlternateLayout } from './alternate-layout';

function layout(alternateLayout: 'de' | null) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          ...defaultDeploymentConfig,
          search: { ...defaultDeploymentConfig.search, alternateLayout },
        },
      },
    ],
  });
  return TestBed.inject(AlternateLayout);
}

describe('AlternateLayout.matches', () => {
  it('ignores case and the spaces around the query', () => {
    const matches = layout(null).matches(' ESPRESSO ');
    expect(matches('Hafen Espresso')).toBe(true);
    expect(matches('Filter roast')).toBe(false);
  });

  it('finds a query typed on the other layout', () => {
    expect(layout('de').matches('zoga')('Yoga mat')).toBe(true);
  });

  it('matches everything for an empty query', () => {
    expect(layout(null).matches('')('anything')).toBe(true);
  });
});
