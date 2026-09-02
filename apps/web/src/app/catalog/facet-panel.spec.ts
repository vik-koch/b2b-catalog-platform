import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Facet, FacetValue } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
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

const text = defaultAppText.catalog.filters;

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

  it('keeps the clear-all button in place, dead, while nothing is ticked', async () => {
    // Rendered either way: appearing with the first selection would shift
    // every facet list the moment one was clicked.
    const { buttonWith } = await render([facet()]);

    expect(buttonWith(text.clearAll)?.disabled).toBe(true);
  });

  it('disables a value that would leave nothing, unless it is already ticked', async () => {
    const { boxes } = await render([
      facet({
        values: [
          value('coarse', 0),
          value('fine', 0, true),
          value('medium', 2),
        ],
      }),
    ]);

    expect(boxes().map((b) => b.disabled)).toEqual([true, false, false]);
  });

  it('renders the unit beside every value of its attribute', async () => {
    const { host } = await render([
      facet({
        slug: 'length',
        name: 'Length',
        type: 'number',
        unit: 'cm',
        values: [value('30')],
      }),
    ]);

    expect(host.textContent).toContain('30 cm');
  });

  it('collapses a long value list, but never one hiding a selected value', async () => {
    const many = (selectedIndex: number | null) =>
      facet({
        values: Array.from({ length: 12 }, (_, i) =>
          value(`v${i}`, 1, i === selectedIndex),
        ),
      });

    const collapsed = await render([many(null)]);
    expect(collapsed.boxes()).toHaveLength(8);
    collapsed.buttonWith(defaultAppText.catalog.showMore)?.click();
    collapsed.fixture.detectChanges();
    expect(collapsed.boxes()).toHaveLength(12);

    TestBed.resetTestingModule();
    // The eleventh value is ticked, so the facet cannot open collapsed: a
    // shared link would otherwise hide part of its own filter.
    const shared = await render([many(10)]);
    expect(shared.boxes()).toHaveLength(12);
  });
});
