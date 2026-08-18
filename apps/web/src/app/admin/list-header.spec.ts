import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import { defaultAdminText } from '../config/admin-text.fixture';
import { AdminListHeader } from './list-header';

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
  const clear = [...el.querySelectorAll('a')].find((a) =>
    a.textContent?.includes(defaultAdminText.common.clearFilters),
  );
  if (!clear) throw new Error('no clear-filters link');
  return { fixture, el, clear };
}

describe('AdminListHeader', () => {
  it('shows the title, the search box and the projected actions', () => {
    const { el } = render(false);

    expect(el.querySelector('h1')?.textContent).toContain('Products');
    expect(el.querySelector('input[type="search"]')).not.toBeNull();
    expect(el.textContent).toContain('Add product');
  });

  it('keeps the clear-filters button as a spacer while nothing is filtered', () => {
    // Present so the search box beside it never moves, but not a control: no
    // hit area, no tab stop, and nothing for a screen reader to offer.
    const { clear } = render(false);

    expect(clear.classList).toContain('invisible');
    expect(clear.getAttribute('aria-hidden')).toBe('true');
    expect(clear.getAttribute('tabindex')).toBe('-1');
  });

  it('turns it into a real control once the list is filtered', () => {
    const { clear } = render(true);

    expect(clear.classList).not.toContain('invisible');
    expect(clear.getAttribute('aria-hidden')).toBeNull();
    expect(clear.getAttribute('tabindex')).toBeNull();
    // Same route, no query parameters: everything narrowing the list goes.
    expect(clear.getAttribute('href')).toBe('/');
  });
});
