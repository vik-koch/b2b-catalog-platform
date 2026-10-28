import { provideUiText, SHARED_TEXT } from '../../../shared/config/shared-text';
import { defaultSharedText } from '../../../shared/config/shared-text.fixture';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Facet, FacetValue } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../../shared/config/storefront-text.fixture';
import { FacetFilters, FacetValueToggle } from './facet-filters';

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

@Component({
  imports: [FacetFilters],
  template: `
    <app-facet-filters
      [facets]="facets()"
      [sorted]="sorted()"
      (valueToggled)="toggles.push($event)"
      (cleared)="clears = clears + 1"
    >
      <p class="sort">Sort here</p>
    </app-facet-filters>
  `,
})
class Host {
  readonly facets = signal<Facet[]>([]);
  readonly sorted = signal(false);
  readonly toggles: FacetValueToggle[] = [];
  clears = 0;
}

async function render(facets: Facet[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      provideUiText(),
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.facets.set(facets);
  fixture.detectChanges();
  await fixture.whenStable();

  const host = fixture.nativeElement as HTMLElement;
  const boxes = () => [
    ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  /** By text or by accessible name. The clear-all is drawn twice, as the
   * column heading's control and beside the toggle; one is on screen. */
  const buttonWith = (label: string) =>
    [...host.querySelectorAll('button')].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute('aria-label') === label,
    );
  /** The panel's clip: the element the open state draws or hides. */
  const panelContent = () =>
    host.querySelector('#facet-panel')?.parentElement as HTMLElement;

  return { fixture, host, boxes, buttonWith, panelContent };
}

const text = defaultStorefrontText.catalog.filters;

describe('FacetFilters', () => {
  it('reports the value ticked, and the facet it belongs to', async () => {
    const { fixture, boxes } = await render([facet()]);

    boxes()[1].click();

    const [toggle] = fixture.componentInstance.toggles;
    expect(toggle.facet.slug).toBe('grind');
    expect(toggle.value.value).toBe('fine');
  });

  it('reports a clear-all once something is ticked', async () => {
    const { fixture, buttonWith } = await render([
      facet({ values: [value('coarse', 3, true)] }),
    ]);

    buttonWith(text.clearAll)?.click();

    expect(fixture.componentInstance.clears).toBe(1);
  });

  it('keeps the clear-all button in place, dead, while nothing is ticked', async () => {
    // Rendered either way: appearing with the first selection would shift
    // every facet list the moment one was clicked.
    const { buttonWith } = await render([facet()]);

    expect(buttonWith(text.clearAll)?.disabled).toBe(true);
  });

  it('draws the projected sort control only when told one is there', async () => {
    const { fixture, host } = await render([facet()]);
    expect(host.querySelector('.sort')).toBeNull();

    fixture.componentInstance.sorted.set(true);
    fixture.detectChanges();

    expect(host.querySelector('.sort')).not.toBeNull();
  });

  // Clipped is not enough: the shut panel's checkboxes must leave the tab
  // order, and come back from the column width where there is no toggle.
  it('takes the shut panel out of the tab order, except as a column', async () => {
    const { fixture, panelContent, buttonWith } = await render([facet()]);

    expect(panelContent().classList).toContain('invisible');
    expect(panelContent().classList).toContain(
      '@min-[63.75rem]/listing:visible',
    );

    buttonWith(text.title)?.click();
    fixture.detectChanges();

    expect(panelContent().classList).toContain('visible');
    expect(panelContent().classList).not.toContain('invisible');
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

    // Past the eighth, the values are folded rather than left out: there to
    // open in place, and out of sight and out of the tab order until then.
    const rest = (host: HTMLElement) =>
      host.querySelector('ui-collapsible') as HTMLElement;
    const folded = (host: HTMLElement) =>
      rest(host).className.includes('grid-rows-[0fr]') &&
      (rest(host).firstElementChild as HTMLElement).className.includes(
        'invisible',
      );

    const collapsed = await render([many(null)]);
    expect(collapsed.boxes()).toHaveLength(12);
    expect(rest(collapsed.host).querySelectorAll('input')).toHaveLength(4);
    expect(folded(collapsed.host)).toBe(true);
    collapsed.buttonWith(defaultSharedText.showMore)?.click();
    collapsed.fixture.detectChanges();
    expect(folded(collapsed.host)).toBe(false);

    // The eleventh value is ticked, so the facet cannot open collapsed: a
    // shared link would otherwise hide part of its own filter.
    const shared = await render([many(10)]);
    expect(folded(shared.host)).toBe(false);
  });
});
