import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Suggestion } from './suggestion';

@Component({
  imports: [Suggestion],
  template: `
    <ui-suggestion [segments]="segments">
      @if (caption(); as caption) {
        {{ caption }}
      }
    </ui-suggestion>
  `,
})
class Host {
  readonly segments = [
    { text: 'Kon', match: true },
    { text: 'tor', match: false },
  ];
  readonly caption = signal<string | null>('Hamburg');
}

async function render() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const caption = () => el.querySelectorAll('ui-suggestion > span')[1];
  return { fixture, el, caption };
}

describe('Suggestion', () => {
  it('marks the matched run and puts the caption under the line', async () => {
    const { el, caption } = await render();

    expect(el.querySelector('mark')?.textContent).toBe('Kon');
    expect(caption().textContent?.trim()).toBe('Hamburg');
  });

  // An empty second line would still take its height in every row.
  it('leaves the caption empty, and so hidden, when there is none', async () => {
    const { fixture, caption } = await render();

    fixture.componentInstance.caption.set(null);
    await fixture.whenStable();

    expect(caption().matches(':empty')).toBe(true);
    expect(caption().classList).toContain('empty:hidden');
  });
});
