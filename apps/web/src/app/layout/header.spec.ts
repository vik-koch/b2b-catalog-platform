import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { Header } from './header';

async function render(
  url = '/',
  deployment: DeploymentConfig = defaultDeploymentConfig,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Header],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: deployment },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(Header);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Header', () => {
  // The field used to hide behind a toggle on a phone. It is the primary way
  // into a catalogue this size, and the bottom bar took the glyphs that were
  // crowding it out — so there is one field, always in the document, on every
  // route.
  it('carries one search field, on the results page and off it', async () => {
    const listing = await render('/catalog');
    expect(listing.el.querySelectorAll('app-search-field')).toHaveLength(1);
    expect(
      listing.el.querySelector('button[aria-controls="mobile-search"]'),
    ).toBeNull();

    const results = await render('/search?q=espresso');
    expect(results.el.querySelectorAll('app-search-field')).toHaveLength(1);
  });

  // Below `sm` the header is the page's masthead and scrolls away with it,
  // which leaves the bottom bar as the only permanent chrome on a phone. The
  // results page is the exception: there the field carries the query being
  // viewed, so it sticks at every width.
  it('sticks below sm on the results page only', async () => {
    const listing = await render('/catalog');
    const header = () =>
      listing.el.querySelector('header')?.className as string;
    expect(header()).toContain('sm:sticky');
    expect(header().split(' ')).not.toContain('sticky');

    const results = await render('/search?q=espresso');
    expect(
      (results.el.querySelector('header')?.className as string).split(' '),
    ).toContain('sticky');
  });

  // Both channels at every width — what a narrow row takes is the address's
  // width, not the address.
  it('carries every configured contact channel in both rows', async () => {
    const { el } = await render('/catalog');
    const contacts = Array.from(el.querySelectorAll('app-contact-info'));
    const { contact } = defaultDeploymentConfig;

    // Two instances — the phone's brand row and the utility bar — of which
    // only one is ever displayed.
    expect(contacts).toHaveLength(2);
    for (const info of contacts) {
      const hrefs = Array.from(info.querySelectorAll('a')).map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).toEqual([
        'tel:' + contact?.phone?.replace(/[^\d+]/g, ''),
        'mailto:' + contact?.email,
      ]);
    }
  });

  // The actions live in the bottom bar below `sm`, so the header's copies are
  // display:none there rather than absent — which is what keeps them out of
  // the accessibility tree without a second set of components.
  it('keeps its own action group behind the sm breakpoint', async () => {
    const { el } = await render('/catalog');
    const group = el.querySelector('app-catalog-link')?.parentElement;

    expect(group?.className).toContain('hidden');
    expect(group?.className).toContain('sm:flex');
  });

  it('links the wordmark home, from both rows', async () => {
    const { el } = await render('/catalog');
    const home = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('a[href="/"]'),
    );

    expect(home).toHaveLength(2);
    for (const link of home) {
      expect(link.getAttribute('aria-label')).toContain(
        defaultDeploymentConfig.branding.name,
      );
    }
  });
});
