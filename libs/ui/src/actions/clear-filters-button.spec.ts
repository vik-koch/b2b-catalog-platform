import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClearFiltersButton } from './clear-filters-button';

@Component({
  imports: [ClearFiltersButton],
  template: `
    <ui-clear-filters-button
      label="Clear all filters"
      [filtered]="filtered()"
      (cleared)="clears = clears + 1"
    />
  `,
})
class Host {
  readonly filtered = signal(true);
  clears = 0;
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector(
    'button[aria-label="Clear all filters"]',
  ) as HTMLButtonElement;
  return { fixture, button };
}

describe('ClearFiltersButton', () => {
  it('says what it clears, and clears when pressed', async () => {
    const { fixture, button } = await render();

    expect(button.title).toBe('Clear all filters');
    button.click();

    expect(fixture.componentInstance.clears).toBe(1);
  });

  // Disabled, not hidden: the controls beside it keep their places.
  it('is a dead control while nothing is narrowing the list', async () => {
    const { fixture, button } = await render();

    fixture.componentInstance.filtered.set(false);
    fixture.detectChanges();
    button.click();

    expect(button.disabled).toBe(true);
    expect(fixture.componentInstance.clears).toBe(0);
  });
});
