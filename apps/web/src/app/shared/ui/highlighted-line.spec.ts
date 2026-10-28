import { TestBed } from '@angular/core/testing';
import { HighlightedLine } from './highlighted-line';

function render(segments: { text: string; match: boolean }[]) {
  const fixture = TestBed.createComponent(HighlightedLine);
  fixture.componentRef.setInput('segments', segments);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('HighlightedLine', () => {
  it('marks the matched runs only', () => {
    const el = render([
      { text: 'Harbour', match: true },
      { text: ' Road', match: false },
    ]);

    expect([...el.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      'Harbour',
    ]);
  });

  // Whitespace between the parts would render as a space inside the word.
  it('keeps a word split mid-run whole', () => {
    const el = render([
      { text: 'Harb', match: true },
      { text: 'our Road', match: false },
    ]);

    expect(el.textContent).toBe('Harbour Road');
  });
});
