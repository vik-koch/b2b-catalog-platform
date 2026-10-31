import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { TestBed } from '@angular/core/testing';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../../shared/config/storefront-text.fixture';
import { defaultSharedText } from '../../../shared/config/shared-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../../shared/config/deployment-config.fixture';
import { LicensesPage } from './licenses-page';

const NOTICE_FILE = `
${'-'.repeat(80)}
Package: slugify
License: "MIT"

The MIT License (MIT)
`;

const realFetch = globalThis.fetch;

/**
 * The notice file comes from the SSR tier, not the API, so there is no ts-rest
 * client to stub — the page uses `fetch` and so does the test.
 */
function stubFetch(response: { ok: boolean; body?: string }) {
  globalThis.fetch = (async () => ({
    ok: response.ok,
    text: async () => response.body ?? '',
  })) as unknown as typeof fetch;
}

async function render() {
  TestBed.configureTestingModule({
    imports: [LicensesPage],
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      // Only reached through usePageSeo, which composes the document title.
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  const fixture = TestBed.createComponent(LicensesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LicensesPage', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lists a package and its license from the build notice file', async () => {
    stubFetch({ ok: true, body: NOTICE_FILE });

    const element = await render();

    const summary = element.querySelector('summary');
    expect(summary?.textContent).toContain('slugify');
    expect(summary?.textContent).toContain('MIT');
    expect(element.querySelector('pre')?.textContent).toContain(
      'The MIT License (MIT)',
    );
  });

  it('explains itself instead of erroring when the build extracted no licenses', async () => {
    stubFetch({ ok: false });

    const element = await render();

    expect(element.textContent).toContain(
      defaultStorefrontText.licenses.unavailable,
    );
    expect(element.querySelector('details')).toBeNull();
  });

  it('survives a failed fetch without throwing', async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const element = await render();

    expect(element.querySelector('h1')?.textContent).toContain(
      defaultSharedText.nav['licenses'],
    );
    expect(element.querySelector('details')).toBeNull();
  });
});
