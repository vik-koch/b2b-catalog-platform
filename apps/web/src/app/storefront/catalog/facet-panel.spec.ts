import { provideUiText, SHARED_TEXT } from '../../shared/config/shared-text';
import { defaultSharedText } from '../../shared/config/shared-text.fixture';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  Facet,
  FacetValue,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { defaultStorefrontText } from '../../shared/config/storefront-text.fixture';
import { FacetPanel } from './facet-panel';

const value = (v: string, count = 3, selected = false): FacetValue => ({
  value: v,
  count,
  selected,
});

const facet = (over: Partial<Facet> = {}): Facet => ({
  slug: 'grind',
  name: 'Grind',
  type: 'text',
  unit: null,
  values: [value('coarse'), value('fine')],
  ...over,
});

/** A host page the panel can navigate within, so the URL is observable. */
@Component({
  imports: [FacetPanel],
  template: `<app-facet-panel [facets]="facets()" />`,
})
class Host {
  readonly facets = signal<Facet[]>([]);
}

async function render(facets: Facet[], startUrl = '/catalog/espresso') {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ path: '**', component: Host }]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      provideUiText(),
      // The panel reads the sort-control flag to decide whether anything
      // stands above the facets, so the token has to be there.
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(startUrl);

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.facets.set(facets);
  fixture.detectChanges();
  await fixture.whenStable();

  const host = fixture.nativeElement as HTMLElement;
  const boxes = () => [
    ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  /** Ticks a box the way a visitor would, and waits for the navigation. */
  const click = async (index: number) => {
    boxes()[index].click();
    await fixture.whenStable();
  };
  /** By text or by accessible name: the clear-all is a glyph now, and the
   * panel draws it twice — as the column heading's control, and beside the
   * disclosure toggle — of which only one is ever on screen. */
  const buttonWith = (label: string) =>
    [...host.querySelectorAll('button')].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute('aria-label') === label,
    );

  return { router, host, boxes, click, buttonWith, fixture };
}

const text = defaultStorefrontText.catalog.filters;

describe('FacetPanel', () => {
  it('writes a ticked value to the URL and returns to the first page', async () => {
    const { router, click } = await render(
      [facet()],
      '/catalog/espresso?page=3',
    );

    await click(1);

    expect(router.url).toBe('/catalog/espresso?attr=grind:fine');
  });

  it('keeps other attributes selected while toggling one', async () => {
    const { router, click } = await render([
      facet({ values: [value('coarse', 3, true), value('fine')] }),
      facet({ slug: 'origin', name: 'Origin', values: [value('brazil')] }),
    ]);

    await click(2);

    expect(router.url).toBe(
      '/catalog/espresso?attr=grind:coarse&attr=origin:brazil',
    );
  });

  it('drops the parameter entirely when the last value is unticked', async () => {
    const { router, click } = await render(
      [facet({ values: [value('coarse', 3, true)] })],
      '/catalog/espresso?attr=grind:coarse',
    );

    await click(0);

    expect(router.url).toBe('/catalog/espresso');
  });

  it('clears every selection at once', async () => {
    const all = await render(
      [
        facet({ values: [value('coarse', 3, true)] }),
        facet({
          slug: 'origin',
          name: 'Origin',
          values: [value('brazil', 1, true)],
        }),
      ],
      '/catalog/espresso?attr=grind:coarse&attr=origin:brazil',
    );

    all.buttonWith(text.clearAll)?.click();
    await all.fixture.whenStable();

    expect(all.router.url).toBe('/catalog/espresso');
  });
});
