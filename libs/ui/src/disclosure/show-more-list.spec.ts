import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShowMoreList } from './show-more-list';
import { provideTestUiText } from '../core/ui-text.testing';

interface Row {
  key: string;
}

const rows = (...keys: string[]): Row[] => keys.map((key) => ({ key }));

@Component({
  imports: [ShowMoreList],
  template: `
    <ui-show-more-list
      restId="rest"
      [items]="items()"
      [limit]="2"
      [open]="open()"
      [trackBy]="byKey"
      (toggled)="open.set(!open())"
    >
      <ng-template let-row
        ><li class="row">{{ row.key }}</li></ng-template
      >
    </ui-show-more-list>
  `,
})
class Host {
  readonly items = signal(rows('a', 'b', 'c'));
  readonly open = signal(false);
  readonly byKey = (row: Row) => row.key;
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideTestUiText()],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    rowsIn: (selector: string) =>
      [...el.querySelectorAll(`${selector} .row`)].map((li) => li.textContent),
    toggle: () => el.querySelector('button') as HTMLButtonElement,
  };
}

describe('ShowMoreList', () => {
  it('shows the first few and folds the rest behind the toggle', async () => {
    const { fixture, el, rowsIn, toggle } = await render();

    expect(rowsIn('ui-show-more-list > ul')).toEqual(['a', 'b']);
    expect(rowsIn('ui-collapsible')).toEqual(['c']);
    expect(el.querySelector('ui-collapsible')?.id).toBe('rest');
    expect(toggle().getAttribute('aria-controls')).toBe('rest');
    expect(toggle().textContent?.trim()).toBe('Show more');

    toggle().click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(true);
    expect(toggle().textContent?.trim()).toBe('Show less');
  });

  it('has no toggle when everything fits', async () => {
    const { fixture, el } = await render();

    fixture.componentInstance.items.set(rows('a', 'b'));
    fixture.detectChanges();

    expect(el.querySelector('ui-collapsible')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  // New objects for the same rows, as a refetch brings: the row a reader just
  // pressed must stay the element that has focus.
  it('keeps a row by its key when the items are replaced', async () => {
    const { fixture, el } = await render();
    const before = el.querySelector('.row');

    fixture.componentInstance.items.set(rows('a', 'b', 'c'));
    fixture.detectChanges();

    expect(el.querySelector('.row')).toBe(before);
  });
});
