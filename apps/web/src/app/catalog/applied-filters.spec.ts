import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Facet } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AppliedFilters } from './applied-filters';

const facet = (over: Partial<Facet> = {}): Facet => ({
  slug: 'grind',
  name: 'Grind',
  type: 'text',
  unit: null,
  values: [],
  ...over,
});

/** A host page the chips can navigate within, so the URL is observable. */
@Component({
  imports: [AppliedFilters],
  template: `<app-applied-filters [facets]="facets()" />`,
})
class Host {
  readonly facets = signal<Facet[]>([]);
}

async function render(facets: Facet[], startUrl = '/catalog/espresso') {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ path: '**', component: Host }]),
      { provide: APP_TEXT, useValue: defaultAppText },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(startUrl);

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.facets.set(facets);
  fixture.detectChanges();
  await fixture.whenStable();

  const host = fixture.nativeElement as HTMLElement;
  return {
    router,
    fixture,
    chips: () => [...host.querySelectorAll('li')],
    labels: () =>
      [...host.querySelectorAll('li span')].map((s) => s.textContent?.trim()),
    remove: async (index: number) => {
      host.querySelectorAll('button')[index].click();
      await fixture.whenStable();
    },
  };
}

describe('AppliedFilters', () => {
  it('renders nothing at all while no value is ticked', async () => {
    const { chips } = await render([
      facet({ values: [{ value: 'fine', count: 2, selected: false }] }),
    ]);

    expect(chips()).toHaveLength(0);
  });

  it('names the attribute and the value, unit included', async () => {
    const { labels } = await render([
      facet({
        values: [
          { value: 'coarse', count: 1, selected: true },
          { value: 'fine', count: 2, selected: false },
        ],
      }),
      facet({
        slug: 'length',
        name: 'Length',
        type: 'number',
        unit: 'cm',
        values: [{ value: '30', count: 1, selected: true }],
      }),
    ]);

    expect(labels()).toEqual(['Grind: coarse', 'Length: 30 cm']);
  });

  it('removes one value and leaves the rest of the selection alone', async () => {
    const { router, remove } = await render(
      [
        facet({
          values: [
            { value: 'coarse', count: 1, selected: true },
            { value: 'fine', count: 2, selected: true },
          ],
        }),
        facet({
          slug: 'origin',
          name: 'Origin',
          values: [{ value: 'brazil', count: 1, selected: true }],
        }),
      ],
      '/catalog/espresso?attr=grind:coarse&attr=grind:fine&attr=origin:brazil',
    );

    await remove(0);

    expect(router.url).toBe(
      '/catalog/espresso?attr=grind:fine&attr=origin:brazil',
    );
  });

  it('returns to the first page, like every other selection change', async () => {
    const { router, remove } = await render(
      [facet({ values: [{ value: 'coarse', count: 1, selected: true }] })],
      '/catalog/espresso?attr=grind:coarse&page=4',
    );

    await remove(0);

    expect(router.url).toBe('/catalog/espresso');
  });
});
