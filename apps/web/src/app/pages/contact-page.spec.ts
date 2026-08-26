import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import {
  ContactLocation,
  DeploymentConfig,
} from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { EditModeService } from '../admin/edit-mode.service';
import { ContactPage } from './contact-page';
import { PageService } from './page.service';

/** The page's prose is a Page body now; the locations around it stay config. */
const contactBody = {
  title: 'Contact',
  bodyHtml: '<p>Visit us or get in touch.</p>',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

function config(locations: readonly ContactLocation[]): DeploymentConfig {
  return { ...defaultDeploymentConfig, locations };
}

async function render(
  locations: readonly ContactLocation[],
  getPage: () => Promise<typeof contactBody | null> = async () => contactBody,
) {
  TestBed.configureTestingModule({
    imports: [ContactPage],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config(locations) },
      { provide: PageService, useValue: { getPage } },
      {
        provide: EditModeService,
        useValue: { enabled: () => false, settled: () => true },
      },
    ],
  });
  const fixture = TestBed.createComponent(ContactPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ContactPage', () => {
  it('renders a location with its name, description and map iframe', async () => {
    const el = await render([
      {
        key: 'hq',
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

  it('renders the editable page body above the office list', async () => {
    const el = await render([
      { key: 'hq', name: 'HQ', map: { url: 'https://maps.example/hq' } },
    ]);

    expect(el.querySelector('.prose')?.innerHTML).toContain(
      'Visit us or get in touch.',
    );
  });

  it('renders one map per location, so multi-location needs no code change', async () => {
    const el = await render([
      { key: 'north', name: 'North', map: { url: 'https://maps.example/n' } },
      { key: 'south', name: 'South', map: { url: 'https://maps.example/s' } },
    ]);

    expect(el.querySelectorAll('iframe').length).toBe(2);
    expect(el.textContent).toContain('North');
    expect(el.textContent).toContain('South');
  });

  const locations = [
    { key: 'hq', name: 'HQ', map: { url: 'https://maps.example/hq' } },
  ];

  it('shows the load error instead of a half page when the body fails', async () => {
    // The office list alone under an empty heading would look like the page,
    // in a 200 — LoadErrorView says the site is broken and answers 503.
    const el = await render(locations, () => Promise.reject(new Error('down')));

    expect(el.textContent).toContain(defaultAppText.errors.cannotLoadTitle);
    expect(el.querySelector('iframe')).toBeNull();
  });

  it('shows the load error when the page has no body yet', async () => {
    const el = await render(locations, async () => null);

    expect(el.textContent).toContain(defaultAppText.errors.cannotLoadTitle);
    expect(el.querySelector('iframe')).toBeNull();
  });
});
