import { TestBed } from '@angular/core/testing';
import { APP_TEXT, defaultAppText } from '../config/app-text';
import {
  ContactLocation,
  DEPLOYMENT_CONFIG,
  DeploymentConfig,
} from '../config/deployment-config';
import { ContactPage } from './contact-page';

function config(locations: readonly ContactLocation[]): DeploymentConfig {
  return {
    branding: { name: 'Test', logo: '/logo.svg' },
    cookieConsentEnabled: false,
    locations,
  };
}

async function render(locations: readonly ContactLocation[]) {
  TestBed.configureTestingModule({
    imports: [ContactPage],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config(locations) },
    ],
  });
  const fixture = TestBed.createComponent(ContactPage);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ContactPage', () => {
  it('renders a location with its name, description and map iframe', async () => {
    const el = await render([
      {
        name: 'HQ',
        description: 'Main St 1',
        map: { url: 'https://maps.example/hq' },
      },
    ]);

    expect(el.querySelector('h1')?.textContent).toContain(
      defaultAppText.nav['contact'],
    );
    expect(el.textContent).toContain('HQ');
    expect(el.textContent).toContain('Main St 1');

    const iframe = el.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://maps.example/hq');
    expect(iframe?.getAttribute('title')).toContain('HQ');
  });

  it('renders one map per location, so multi-location needs no code change', async () => {
    const el = await render([
      { name: 'North', map: { url: 'https://maps.example/n' } },
      { name: 'South', map: { url: 'https://maps.example/s' } },
    ]);

    expect(el.querySelectorAll('iframe').length).toBe(2);
    expect(el.textContent).toContain('North');
    expect(el.textContent).toContain('South');
  });
});
