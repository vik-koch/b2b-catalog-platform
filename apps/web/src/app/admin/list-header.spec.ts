import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import { defaultAdminText } from '../config/admin-text.fixture';
import { AdminListHeader } from './list-header';

const clearLabel = defaultAdminText.common.clearFilters;

/** A caller, since the actions are projected rather than configured. */
@Component({
  imports: [AdminListHeader],
  template: `
    <app-admin-list-header title="Products" [filtered]="filtered">
      <a href="/admin/products/new">Add product</a>
    </app-admin-list-header>
  `,
})
class Host {
  filtered = false;
}

function render(filtered: boolean) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.filtered = filtered;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const clear = el.querySelector<HTMLElement>(`[aria-label="${clearLabel}"]`);
  if (!clear) throw new Error('no clear-filters control');
  return { fixture, el, clear };
}

describe('AdminListHeader', () => {
  it('shows the title, the search box and the projected actions', () => {
    const { el } = render(false);

    expect(el.querySelector('h1')?.textContent).toContain('Products');
    expect(el.querySelector('input[type="search"]')).not.toBeNull();
    expect(el.textContent).toContain('Add product');
  });

  /*
   * The way back to the whole list sits beside the search box, glyph-sized and
   * always there. It used to be a labelled button in the row of actions,
   * reserved as an invisible spacer so the box would not move when it appeared
   * — which pushed the page's own "Add" button a line below the box it was
   * meant to sit beside. Inert is now a real disabled button rather than a
   * hidden link: the difference is whether it can be tabbed to and pressed.
   */
  it('keeps the clear-filters control inert while nothing is filtered', () => {
    const { clear } = render(false);

    expect(clear.tagName).toBe('BUTTON');
    expect(clear.hasAttribute('disabled')).toBe(true);
  });

  it('turns it into a real control once the list is filtered', () => {
    const { clear } = render(true);

    expect(clear.tagName).toBe('A');
    // Same route, no query parameters: everything narrowing the list goes.
    expect(clear.getAttribute('href')).toBe('/');
  });
});
