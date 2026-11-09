import { TestBed } from '@angular/core/testing';

import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { GridTimestamp } from './grid-timestamp';

describe('GridTimestamp', () => {
  it('writes the moment on the shop’s clock, not the viewer’s', async () => {
    const config = { ...defaultDeploymentConfig, timeZone: 'Pacific/Auckland' };
    TestBed.configureTestingModule({
      imports: [GridTimestamp],
      providers: [{ provide: DEPLOYMENT_CONFIG, useValue: config }],
    });
    const fixture = TestBed.createComponent(GridTimestamp);
    fixture.componentRef.setInput('value', '2026-11-09T12:00:00.000Z');
    await fixture.whenStable();

    // 01:00 on the 10th in Auckland; noon on the 9th in UTC.
    const inAuckland = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(config.locale, {
        ...options,
        timeZone: 'Pacific/Auckland',
      }).format(new Date('2026-11-09T12:00:00.000Z'));
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain(
      inAuckland({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    );
    expect(text).toContain(inAuckland({ timeStyle: 'medium' }));
  });
});
