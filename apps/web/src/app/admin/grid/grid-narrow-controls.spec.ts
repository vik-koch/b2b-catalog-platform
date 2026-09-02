import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { GridChip, GridColumn } from './grid-column';
import { GridNarrowControls } from './grid-narrow-controls';

const common = defaultAdminText.common;

const columns: GridColumn[] = [
  { key: 'name', label: 'Name', sort: { asc: 'name', desc: 'name_desc' } },
  {
    key: 'registered',
    label: 'Registered',
    sort: { asc: 'registered', desc: 'registered_desc', descFirst: true },
  },
  {
    key: 'status',
    label: 'All statuses',
    filter: {
      param: 'status',
      options: [
        { value: '', label: 'All statuses' },
        { value: 'pending', label: 'Pending' },
      ],
      value: 'pending',
      ariaLabel: 'Filter by status',
    },
  },
];

@Component({
  imports: [GridNarrowControls],
  template: `
    <app-grid-narrow-controls
      [columns]="columns"
      [chips]="chips"
      [sort]="sort()"
      defaultSort="registered_desc"
      [filtered]="true"
    />
  `,
})
class Host {
  readonly columns = columns;
  readonly chips: GridChip[] = [
    {
      label: 'Attribute',
      value: 'roast = dark',
      clearParams: { attributeKey: null, attributeValue: null },
      clearLabel: 'Clear the attribute filter',
    },
  ];
  readonly sort = signal<string | null>('name');
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    router: TestBed.inject(Router),
  };
}

/** The one control a test is about; missing is a failure, not an option. */
function selectIn(el: HTMLElement, selector: string): HTMLSelectElement {
  const found = el.querySelector<HTMLSelectElement>(selector);
  if (!found) throw new Error(`no ${selector} on the page`);
  return found;
}

/** The one row on screen is a disclosure; everything else is behind it. */
function open(fixture: { detectChanges(): void }, el: HTMLElement): void {
  el.querySelector('button')?.click();
  fixture.detectChanges();
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('GridNarrowControls (FR-ADM-05)', () => {
  it('offers every sortable column in both directions, leading with the one a click would take', async () => {
    const { el, fixture } = await render();
    open(fixture, el);
    const sort = selectIn(el, 'select');

    expect([...sort.options].map((o) => o.value)).toEqual([
      'name',
      'name_desc',
      // Recency reads newest-first, as its column heading does.
      'registered_desc',
      'registered',
    ]);
    expect(sort.options[0].textContent).toContain('Name');
    expect(sort.value).toBe('name');
  });

  it('writes the chosen sort into the URL, and leaves the default out of it', async () => {
    const { el, fixture, router } = await render();
    open(fixture, el);
    const sort = selectIn(el, 'select');
    const navigate = vi.spyOn(router, 'navigate');

    choose(sort, 'name_desc');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { sort: 'name_desc', page: null },
      }),
    );

    // The default ordering is the plain URL, here as everywhere else.
    choose(sort, 'registered_desc');
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { sort: null, page: null } }),
    );
  });

  // One column filter and one chip: the narrowings with no column of their own
  // narrow the list exactly as much, and a phone cannot see them anywhere else.
  it('counts every filter in effect, chips included', async () => {
    const { el } = await render();
    const button = el.querySelector('button');

    expect(button?.textContent).toContain(common.filters);
    expect(button?.textContent).toContain('2');
  });

  // A disclosure, not a sheet over the rows: a filter is chosen while looking
  // at what it did to the list, which a modal covers.
  it('keeps the panel shut until it is opened', async () => {
    const { fixture, el } = await render();
    const button = el.querySelector('button');
    const panel = el.querySelector(`#${button?.getAttribute('aria-controls')}`);

    // Shut is a collapsed row of the grid the panel sits in — the only height
    // a transition can run to "as tall as its content" from.
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.parentElement?.parentElement?.classList).toContain(
      'grid-rows-[0fr]',
    );

    open(fixture, el);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.parentElement?.parentElement?.classList).toContain(
      'grid-rows-[1fr]',
    );
  });

  it('shows the filters with no column of their own, and the way out of one', async () => {
    const { fixture, el } = await render();
    open(fixture, el);

    expect(el.textContent).toContain('roast = dark');
    expect(
      el.querySelector('[aria-label="Clear the attribute filter"]'),
    ).not.toBeNull();
  });

  it('opens the filters the column headings would have held', async () => {
    const { fixture, el, router } = await render();
    open(fixture, el);

    // The sort comes first, then one field per filtered column.
    const filter = [...el.querySelectorAll('select')][1];
    expect(filter.value).toBe('pending');

    const navigate = vi.spyOn(router, 'navigate');
    // Back to every status: an empty choice clears the parameter rather than
    // writing `?status=`.
    choose(filter, '');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { status: null, page: null } }),
    );
  });
});
