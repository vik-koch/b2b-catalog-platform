import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT, defaultAppText } from '../config/app-text';
import {
  DEPLOYMENT_CONFIG,
  DeploymentConfig,
} from '../config/deployment-config';
import { Footer } from './footer';

function config(cookieConsentEnabled: boolean): DeploymentConfig {
  return {
    branding: { name: 'Test', logo: '/logo.svg' },
    cookieConsentEnabled,
    locations: [],
  };
}

async function render(enabled: boolean) {
  TestBed.configureTestingModule({
    imports: [Footer],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config(enabled) },
    ],
  });
  const fixture = TestBed.createComponent(Footer);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function buttonLabels(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('button')).map(
    (b) => b.textContent?.trim() ?? '',
  );
}

describe('Footer', () => {
  beforeEach(() => localStorage.clear());

  it('shows the "Cookie settings" control when consent is enabled', async () => {
    const el = await render(true);
    expect(buttonLabels(el)).toContain(defaultAppText.consent.settings);
  });

  it('hides the "Cookie settings" control when consent is disabled', async () => {
    const el = await render(false);
    expect(buttonLabels(el)).not.toContain(defaultAppText.consent.settings);
  });

  it('always renders the legal nav links', async () => {
    const el = await render(false);
    expect(el.textContent).toContain(defaultAppText.nav['privacy']);
    expect(el.textContent).toContain(defaultAppText.nav['imprint']);
  });
});
