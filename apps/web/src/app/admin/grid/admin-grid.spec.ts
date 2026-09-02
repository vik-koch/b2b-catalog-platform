import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { NARROW_SCREEN_QUERIES } from '../../core/narrow-screen';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { AdminGrid } from './admin-grid';
import { GridColumn } from './grid-column';
import { GridWidths, GRID_WIDTHS_KEY } from './grid-widths';
import { GridCardTemplate, GridRowTemplate } from './grid-templates';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: '1', name: 'Alex', status: 'active' },
  { id: '2', name: 'Sam', status: 'pending' },
];

const columns: GridColumn[] = [
  { key: 'name', label: 'Name', sort: { asc: 'name', desc: 'name_desc' } },
  {
    key: 'status',
    label: 'All statuses',
    filter: {
      param: 'status',
      options: [
        { value: '', label: 'All statuses' },
        { value: 'active', label: 'Active' },
      ],
      value: '',
      ariaLabel: 'Filter by status',
    },
  },
  // Not negotiable: two glyphs need what they need.
  { key: 'actions', srLabel: 'Actions', fixedWidth: 96 },
];

@Component({
  imports: [AdminGrid, GridRowTemplate, GridCardTemplate],
  template: `
    <app-admin-grid
      gridId="test"
      [columns]="columns"
      [rows]="rows()"
      [trackBy]="byId"
      [sort]="null"
      emptyMessage="Nothing here"
    >
      <ng-template appGridRow [of]="rows()" let-row>
        <td class="name-cell">{{ row.name }}</td>
        <td>{{ row.status }}</td>
        <td><button type="button">edit</button></td>
      </ng-template>
      <ng-template appGridCard [of]="rows()" let-row>
        <span class="card-row">{{ row.name }} — {{ row.status }}</span>
      </ng-template>
    </app-admin-grid>
  `,
})
class Host {
  readonly columns = columns;
  readonly rows = signal<Row[]>(rows);
  readonly byId = (row: Row): string => row.id;
}

/** The real one, captured once at module load — before any test has had the
 * chance to replace it. */
const realMatchMedia = window.matchMedia;

// Restored after every test, from a hook registered once at collection time.
// Registering it from inside `screen()` instead meant one hook per test, each
// capturing whatever `window.matchMedia` happened to be when that test
// started — which from the second test on was the previous test's stub. The
// stub therefore outlived this file and, since it answered `matches` to every
// query asked of it, changed what unrelated specs saw for queries of their
// own. That is exactly the kind of leak that only ever fails in CI, where the
// file order differs.
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

/** A window of the given shape, for the two markups this component chooses
 * between. Only the breakpoint queries are answered; anything else — a
 * `prefers-reduced-motion` somewhere else in the app, say — is left to the
 * real implementation, so nothing this file does can decide a question it was
 * not asked. */
const BREAKPOINT_QUERIES: readonly string[] = Object.values(
  NARROW_SCREEN_QUERIES,
);

function screen(narrow: boolean): void {
  window.matchMedia = ((query: string) =>
    BREAKPOINT_QUERIES.includes(query)
      ? ({
          matches: narrow,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaQueryList)
      : realMatchMedia.call(window, query)) as typeof window.matchMedia;
}

function render(stored?: GridWidths) {
  localStorage.clear();
  if (stored) {
    localStorage.setItem(
      GRID_WIDTHS_KEY,
      JSON.stringify({ v: 1, grids: { test: stored } }),
    );
  }

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

afterEach(() => localStorage.clear());

describe('AdminGrid on a desktop (FR-ADM-05)', () => {
  beforeEach(() => screen(false));

  it('draws a table with one heading per declared column', () => {
    const { el } = render();

    const headings = el.querySelectorAll('thead th');
    expect(headings.length).toBe(columns.length);
    // The sortable column is a button; the filtered one is its own select, and
    // the option in effect is what names the column.
    expect(headings[0].querySelector('button')?.textContent).toContain('Name');
    expect(headings[1].querySelector('select')).not.toBeNull();
  });

  // The hidden contract of a row template: its cells are written by the page,
  // so nothing but a test holds them to the columns declared beside them.
  it('renders one cell per column for every row', () => {
    const { el } = render();

    const bodyRows = el.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(rows.length);
    for (const row of bodyRows) {
      expect(row.querySelectorAll('td').length).toBe(columns.length);
    }
    expect(el.querySelector('.name-cell')?.textContent).toContain('Alex');
  });

  // Nothing measured yet (a test DOM lays nothing out), so the browser still
  // owns the widths and there is no boundary to drag.
  it('leaves the columns to the browser until they have been measured', () => {
    const { el } = render();

    expect(el.querySelector('colgroup')).toBeNull();
    expect(el.querySelector('table')?.classList).toContain('table-auto');
    expect(el.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  it('applies the widths an admin dragged, and offers a way back', () => {
    // Only the negotiable columns are stored: the fixed one is not a share.
    const { el } = render({ name: 0.7, status: 0.3 });

    const cols = el.querySelectorAll<HTMLElement>('colgroup col');
    expect(cols.length).toBe(columns.length);
    expect(cols[0].style.width).toBe('70%');
    // The fixed column asks for its pixels; the other two divide what is left.
    expect(cols[2].style.width).toBe('96px');
    expect(el.querySelector('table')?.classList).toContain('table-fixed');
    // One boundary: the last column owns none, and a fixed column has no share
    // to trade with the one before it.
    expect(el.querySelectorAll('[role="separator"]').length).toBe(1);
    expect(el.textContent).toContain(defaultAdminText.common.resetWidths);
  });

  it('offers no reset where the widths are the measured ones', () => {
    const { el } = render();

    expect(el.textContent).not.toContain(defaultAdminText.common.resetWidths);
  });

  it('says which of the two nothings an empty grid is', () => {
    const { fixture, el } = render();
    fixture.componentInstance.rows.set([]);
    fixture.detectChanges();

    // The table stays: its headings carry the filter that emptied it.
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.textContent).toContain('Nothing here');
  });
});

describe('AdminGrid on a phone', () => {
  beforeEach(() => screen(true));

  it('draws the records as a list, not as a table', () => {
    const { el } = render();

    expect(el.querySelector('table')).toBeNull();
    const items = el.querySelectorAll('li');
    expect(items.length).toBe(rows.length);
    expect(items[0].textContent).toContain('Alex — active');
  });

  // The filters live in the column headings, and there are none here: without
  // this the phone could not narrow the list at all.
  it('carries the filters and the sort the headings would have held', () => {
    const { el } = render();

    expect(el.textContent).toContain(defaultAdminText.common.filters);
    expect(el.textContent).toContain(defaultAdminText.common.sortLabel);
    // Both the sortable column and the filtered one, in one disclosure.
    const selects = el.querySelectorAll('select');
    expect(selects.length).toBe(2);
    expect(selects[0].textContent).toContain('Name');
    expect(selects[1].textContent).toContain('Active');
  });
});
