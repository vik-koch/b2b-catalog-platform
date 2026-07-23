import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { CookieConsent } from './cookie-consent';

const BANNER = 'aside[aria-label="Cookie consent"]';

function config(cookieConsentEnabled: boolean): DeploymentConfig {
  return {
    branding: { name: 'Test', title: 'Test' },
    cookieConsentEnabled,
    locations: [],
  };
}

async function render(enabled: boolean) {
  TestBed.configureTestingModule({
    imports: [CookieConsent],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
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
    expect(banner?.textContent).toContain(defaultAppText.consent.accept);
    expect(banner?.textContent).toContain(defaultAppText.consent.reject);
  });

  it('never shows the banner when consent is disabled', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;
    expect(el.querySelector(BANNER)).toBeNull();
  });

  it('hides the banner and records the choice after Reject', async () => {
    const fixture = await render(true);
    const el = fixture.nativeElement as HTMLElement;

    const reject = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(defaultAppText.consent.reject),
    );
    reject?.click();
    await fixture.whenStable();

    expect(el.querySelector(BANNER)).toBeNull();
    expect(localStorage.getItem('cookie-consent')).not.toBeNull();
  });
});
