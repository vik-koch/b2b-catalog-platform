import { SHARED_TEXT } from '../../shared/config/shared-text';
import { defaultSharedText } from '../../shared/config/shared-text.fixture';
import { TestBed } from '@angular/core/testing';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { defaultStorefrontText } from '../../shared/config/storefront-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { FeaturedRowService } from '../catalog/featured-row.service';

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
