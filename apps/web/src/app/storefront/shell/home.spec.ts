import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../platform/config/storefront-text.fixture';
import { FeaturedRowService } from '../catalog/featured/featured-row.service';
import { Home } from './home';

describe('Home', () => {
  it('heads the page with the tagline', async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
        { provide: SHARED_TEXT, useValue: defaultSharedText },
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
