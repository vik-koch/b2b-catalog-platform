import { TestBed } from '@angular/core/testing';
import { APP_TEXT, defaultAppText } from '../config/app-text';
import {
  DEPLOYMENT_CONFIG,
  DeploymentConfig,
  MapEmbed,
} from '../config/deployment-config';
import { MapFrame } from './map-frame';

async function render(map: MapEmbed) {
  const config: DeploymentConfig = {
    branding: { name: 'Test', logo: '/logo.svg' },
    // Consent not enforced here — the consent-gated (consentRequired) path is
    // covered with the consent work, not yet.
    cookieConsentEnabled: false,
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
});
