import { COMMON_TEXT } from '../../shared/config/common-text';
import { defaultCommonText } from '../../shared/config/common-text.fixture';
import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../../shared/config/app-text';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { defaultAppText } from '../../shared/config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { FeaturedRowService } from './featured-row.service';

describe('Home', () => {
  it('heads the page with the tagline', async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: APP_TEXT, useValue: defaultAppText },
        { provide: COMMON_TEXT, useValue: defaultCommonText },
        { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
        provideRouter([]),
        { provide: FeaturedRowService, useValue: { row: async () => [] } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      defaultDeploymentConfig.branding.tagline,
    );
  });
});
