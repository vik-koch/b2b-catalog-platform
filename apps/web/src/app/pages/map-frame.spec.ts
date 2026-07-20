import { TestBed } from '@angular/core/testing';
import { APP_TEXT, defaultAppText } from '../config/app-text';
import {
  DEPLOYMENT_CONFIG,
  DeploymentConfig,
  MapEmbed,
} from '../config/deployment-config';
import { MapFrame } from './map-frame';

interface ConsentState {
  readonly enabled?: boolean;
  readonly decision?: 'accepted' | 'rejected';
}

async function render(map: MapEmbed, consent: ConsentState = {}) {
  // ConsentService reads the record at construction, so seed it before DI.
  if (consent.decision) {
    localStorage.setItem(
      'cookie-consent',
      JSON.stringify({
        version: 1,
        choice: consent.decision,
        timestamp: new Date().toISOString(),
      }),
    );
  }
  const config: DeploymentConfig = {
    branding: { name: 'Test', logo: '/logo.svg' },
    cookieConsentEnabled: consent.enabled ?? false,
    locations: [],
  };
  TestBed.configureTestingModule({
    imports: [MapFrame],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
    ],
  });
  const fixture = TestBed.createComponent(MapFrame);
  fixture.componentRef.setInput('map', map);
  fixture.componentRef.setInput('title', 'Test map');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MapFrame', () => {
  beforeEach(() => localStorage.clear());

  it('renders a no-consent map as an iframe bound to the configured URL', async () => {
    const el = await render({ url: 'https://maps.example/x' });

    const iframe = el.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://maps.example/x');
    expect(iframe?.getAttribute('title')).toBe('Test map');
  });

  it('shows the placeholder, not the iframe, when consent is required and not granted', async () => {
    const el = await render(
      { url: 'https://maps.example/x', consentRequired: true },
      { enabled: true },
    );

    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain(defaultAppText.map.consentNotice);
  });

  it('renders the iframe for a consent-required map once accepted', async () => {
    const el = await render(
      { url: 'https://maps.example/x', consentRequired: true },
      { enabled: true, decision: 'accepted' },
    );

    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://maps.example/x',
    );
  });

  it('renders a consent-required map freely where consent is not enforced', async () => {
    // Flag off (no-rules jurisdiction): loads without a banner.
    const el = await render(
      { url: 'https://maps.example/x', consentRequired: true },
      { enabled: false },
    );

    expect(el.querySelector('iframe')).not.toBeNull();
  });
});
