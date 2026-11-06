import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NARROW_SCREEN_QUERIES } from '../core/narrow-screen';
import { imageIcon } from '../icons/glyphs/image';
import { DataGrid } from './data-grid';
import { GridCardTemplate } from './grid-card-template';
import {
  factChips,
  factParams,
  GridColumn,
  GridFactFilter,
} from './grid-column';
import { GridFacts } from './grid-facts';
import { GridRowTemplate } from './grid-row-template';
import { provideTestGridText } from './grid-text.testing';

const filter = (
  has: string[] = [],
  missing: string[] = [],
): GridFactFilter => ({
  label: 'Filter by content',
  hasParam: 'has',
  missingParam: 'missing',
  facts: [
    { value: 'price', label: 'Price' },
    { value: 'picture', label: 'Picture', icon: imageIcon },
    { value: 'documents', label: 'Documents' },
  ],
  has,
  missing,
});

describe('fact parameters (FR-ADM-20)', () => {
  it('moves a fact from one way to the other in one write', () => {
    expect(factParams(filter([], ['picture']), 'picture', 'has')).toEqual({
      has: ['picture'],
      missing: null,
    });
  });

  it('keeps the other facts asked, and clears an emptied list', () => {
    expect(
      factParams(filter(['documents'], ['picture']), 'documents', 'any'),
    ).toEqual({ has: null, missing: ['picture'] });
  });

  it('makes one chip per fact asked, each undoing only itself', () => {
    const chips = factChips(filter(['documents'], ['price', 'picture']), {
      has: 'Has',
      missing: 'Missing',
      clearLabel: 'Remove {way} {fact}',
    });

    expect(chips.map((c) => `${c.label} ${c.value}`)).toEqual([
      'Missing Price',
      'Missing Picture',
      'Has Documents',
    ]);
    expect(chips[1].clearParams).toEqual({
      has: ['documents'],
      missing: ['price'],
    });
    expect(chips[2].clearLabel).toBe('Remove Has Documents');
  });
});

@Component({
  imports: [GridFacts],
  template: `<ui-grid-facts [filter]="filter()" />`,
})
class FactsHost {
  readonly filter = signal(filter());
}

async function renderFacts(url: string, value: GridFactFilter) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FactsHost],
    providers: [
      ...provideTestGridText(),
      provideRouter([{ path: '**', children: [] }]),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(FactsHost);
  fixture.componentInstance.filter.set(value);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const group = (name: string) =>
    el.querySelector(`[role="radiogroup"][aria-label="${name}"]`) as Element;
  const radio = (name: string, way: string) =>
    group(name).querySelector(`input[value="${way}"]`) as HTMLInputElement;
  const query = () =>
    TestBed.inject(Router).routerState.root.snapshot.queryParamMap;
  return { fixture, group, radio, query };
}

describe('GridFacts (FR-ADM-20)', () => {
  it('shows each fact the way it is asked', async () => {
    const { radio } = await renderFacts(
      '/products?missing=picture',
      filter([], ['picture']),
    );

    expect(radio('Picture', 'missing').checked).toBe(true);
    expect(radio('Documents', 'any').checked).toBe(true);
  });

  it('writes a choice at once, keeping the rest and dropping the page', async () => {
    const { fixture, radio, query } = await renderFacts(
      '/products?missing=picture&state=live&page=2',
      filter([], ['picture']),
    );

    radio('Documents', 'missing').click();
    await fixture.whenStable();

    expect(query().getAll('missing')).toEqual(['picture', 'documents']);
    expect(query().get('state')).toBe('live');
    expect(query().has('page')).toBe(false);
  });
});

const columns: GridColumn[] = [
  { key: 'thumb', srLabel: 'Picture', fixedWidth: 48, factsHeading: true },
  { key: 'name', label: 'Name' },
];

@Component({
  imports: [DataGrid, GridRowTemplate, GridCardTemplate],
  template: `
    <ui-data-grid
      gridId="facts"
      [columns]="columns"
      [rows]="rows"
      [trackBy]="byId"
      [facts]="facts()"
    >
      <ng-template uiGridRow [of]="rows" let-row>
        <td></td>
        <td>{{ row.id }}</td>
      </ng-template>
      <ng-template uiGridCard [of]="rows" let-row>{{ row.id }}</ng-template>
    </ui-data-grid>
  `,
})
class GridHost {
  readonly columns = columns;
  readonly rows = [{ id: 'one' }];
  readonly facts = signal(filter());
  readonly byId = (row: { id: string }) => row.id;
}

const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function wideScreen(): void {
  const queries: readonly string[] = Object.values(NARROW_SCREEN_QUERIES);
  window.matchMedia = ((query: string) =>
    queries.includes(query)
      ? ({
          matches: false,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaQueryList)
      : realMatchMedia.call(window, query)) as typeof window.matchMedia;
}

function renderGrid(value: GridFactFilter) {
  wideScreen();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [GridHost],
    providers: [...provideTestGridText(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(GridHost);
  fixture.componentInstance.facts.set(value);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => el.querySelector('thead th button') as HTMLButtonElement;
  return { fixture, el, button };
}

describe('DataGrid with a fact filter (FR-ADM-20)', () => {
  it('puts the button in the marked heading, counting what is asked', () => {
    const { button } = renderGrid(filter(['documents'], ['picture']));

    expect(button().getAttribute('aria-label')).toBe('Filter by content (2)');
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the questions out of view until the button is pressed', async () => {
    const { fixture, el, button } = renderGrid(filter());
    expect(el.querySelector('ui-grid-facts')).toBeNull();

    button().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('ui-grid-facts')).not.toBeNull();
  });

  it('shows what is asked as chips while the panel is shut', () => {
    const { el } = renderGrid(filter(['documents'], []));

    const chip = el.querySelector('ui-grid-chips li');
    const words = [...(chip?.querySelectorAll('span') ?? [])].map((span) =>
      span.textContent?.trim(),
    );
    expect(words).toEqual(['Has', 'Documents']);
    expect(chip?.querySelector('a')?.getAttribute('aria-label')).toBe(
      'Remove Has Documents',
    );
  });
});
