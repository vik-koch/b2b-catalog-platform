import { provideTestGridText, testGridText } from './grid-text.testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GridClearFilters } from './grid-clear-filters';

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
   * The only reading that matches the word on it: a sort is not a filter, it is
   * how what is left is arranged. Clearing used to drop it too, which was the
   * half of the inconsistency nobody could see — the other half being that the
   * control stayed inert while only the sort had been changed, which is right
   * exactly because it does not touch the sort.
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
