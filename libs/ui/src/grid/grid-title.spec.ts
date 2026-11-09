import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GridTitle } from './grid-title';
import { GridTitleLink } from './grid-title-link';

@Component({
  imports: [GridTitle, GridTitleLink],
  template: `
    <ui-grid-title [key]="key()">
      <a uiGridTitleLink href="/x">A rather long name</a>
    </ui-grid-title>
  `,
})
class Host {
  readonly key = signal<string | null>(null);
}

function render(key: string | null) {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.key.set(key);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const title = el.querySelector<HTMLElement>('ui-grid-title');
  if (!title) throw new Error('no grid title');
  return title;
}

describe('GridTitle', () => {
  it('wraps the name instead of cutting it to one line', () => {
    const title = render(null);
    expect(title.classList).toContain('line-clamp-3');
    expect(title.classList).not.toContain('truncate');
    expect(title.querySelector('span')).toBeNull();
  });

  it('trails the key after the name, as its tooltip too', () => {
    const title = render('SKU-0042');
    const key = title.querySelector('span');
    expect(title.querySelector('a')?.textContent).toBe('A rather long name');
    expect(key?.textContent).toBe('SKU-0042');
    expect(key?.getAttribute('title')).toBe('SKU-0042');
  });

  it('draws no key for an empty one', () => {
    expect(render('').querySelector('span')).toBeNull();
  });
});
