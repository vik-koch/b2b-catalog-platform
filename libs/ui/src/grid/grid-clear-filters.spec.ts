import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { GridClearFilters } from './grid-clear-filters';
import { provideTestGridText, testGridText } from './grid-text.testing';

const label = testGridText.clearFilters;

@Component({
  imports: [GridClearFilters],
  template: `<ui-grid-clear-filters [filtered]="filtered()" />`,
})
class Host {
  readonly filtered = signal(true);
}

async function render(url = '/admin/products') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      ...provideTestGridText(),
      provideRouter([{ path: '**', children: [] }]),
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
   * As the word says: a sort is no filter but how the rest is arranged, so
   * clearing keeps it, and the control stays inert when only the sort changed.
   */
  it('clears the narrowing and keeps the ordering', async () => {
    const { fixture, control } = await render(
      '/admin/products?state=deleted&searchTerm=beans&sort=price&page=3',
    );

    control?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/admin/products?sort=price');
  });

  it('goes to the plain list where there is no ordering to keep', async () => {
    const { fixture, control } = await render('/admin/products?state=deleted');

    control?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/admin/products');
  });

  it('is a dead control while nothing is narrowing the list', async () => {
    const { fixture, control } = await render('/admin/products?state=deleted');

    fixture.componentInstance.filtered.set(false);
    fixture.detectChanges();

    expect(control?.hasAttribute('disabled')).toBe(true);
  });
});
