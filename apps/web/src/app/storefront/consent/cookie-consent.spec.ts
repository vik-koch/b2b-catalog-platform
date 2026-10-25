import { SHARED_TEXT } from '../../shared/config/shared-text';
import { defaultSharedText } from '../../shared/config/shared-text.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../shared/config/storefront-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { DeploymentConfig } from '@b2b-catalog-platform/shared';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { CookieConsent } from './cookie-consent';

const BANNER = 'aside[aria-label="Cookie consent"]';

function config(cookieConsentEnabled: boolean): DeploymentConfig {
  return { ...defaultDeploymentConfig, cookieConsentEnabled };
}

async function render(enabled: boolean) {
  TestBed.configureTestingModule({
    imports: [CookieConsent],
    providers: [
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: config(enabled) },
    ],
  });
  const fixture = TestBed.createComponent(CookieConsent);
  // Two settle passes: the first render fires afterNextRender (flips `ready`),
  // the second reflects the banner it reveals.
  await fixture.whenStable();
  await fixture.whenStable();
  return fixture;
}

describe('CookieConsent', () => {
  beforeEach(() => localStorage.clear());

  it('shows the banner when consent is enabled and undecided', async () => {
    const el = (await render(true)).nativeElement as HTMLElement;
    const banner = el.querySelector(BANNER);

    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(defaultDeploymentConfig.mapProvider);
    expect(banner?.textContent).not.toContain('{provider}');
    expect(banner?.textContent).toContain(defaultStorefrontText.consent.accept);
    expect(banner?.textContent).toContain(defaultStorefrontText.consent.reject);
  });

  it('never shows the banner when consent is disabled', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;
    expect(el.querySelector(BANNER)).toBeNull();
  });

  it('hides the banner and records the choice after Reject', async () => {
    const fixture = await render(true);
    const el = fixture.nativeElement as HTMLElement;

    const reject = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(defaultStorefrontText.consent.reject),
    );
    reject?.click();
    await fixture.whenStable();

    expect(el.querySelector(BANNER)).toBeNull();
    expect(localStorage.getItem('cookie-consent')).not.toBeNull();
  });
});
