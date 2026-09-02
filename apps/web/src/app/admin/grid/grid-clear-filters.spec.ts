import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { GridClearFilters } from './grid-clear-filters';

const label = defaultAdminText.common.clearFilters;

@Component({
  imports: [GridClearFilters],
  template: `<app-grid-clear-filters [filtered]="filtered()" />`,
})
class Host {
  readonly filtered = signal(true);
}

async function render(url = '/admin/products') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    control: el.querySelector<HTMLElement>(`[aria-label="${label}"]`),
  };
}

describe('GridClearFilters (FR-ADM-05)', () => {
  /*
   * The only reading that matches the word on it: a sort is not a filter, it is
   * how what is left is arranged. Clearing used to drop it too, which was the
   * half of the inconsistency nobody could see — the other half being that the
   * control stayed inert while only the sort had been changed, which is right
   * exactly because it does not touch the sort.
   */
  it('clears the narrowing and keeps the ordering', async () => {
    const { control } = await render(
      '/admin/products?state=deleted&searchTerm=beans&sort=price&page=3',
    );

    // The path is the route this test harness registered; what the control
    // decides is the query it keeps.
    expect(control?.getAttribute('href')).toContain('?sort=price');
  });

  it('goes to the plain list where there is no ordering to keep', async () => {
    const { control } = await render('/admin/products?state=deleted');

    expect(control?.getAttribute('href')).not.toContain('?');
  });

  // Inert is a real disabled button, not a link styled to look spent: the
  // difference is whether it can be tabbed to and pressed.
  it('is a dead control while nothing is narrowing the list', async () => {
    const { fixture, control } = await render();
    expect(control?.tagName).toBe('A');

    fixture.componentInstance.filtered.set(false);
    fixture.detectChanges();

    const inert = (fixture.nativeElement as HTMLElement).querySelector(
      `[aria-label="${label}"]`,
    );
    expect(inert?.tagName).toBe('BUTTON');
    expect(inert?.hasAttribute('disabled')).toBe(true);
  });
});
