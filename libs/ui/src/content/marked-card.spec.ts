import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarkedCard } from './marked-card';
import { Glyph } from '../icons/glyph';
import { mapPinIcon } from '../icons/glyphs/map-pin';

@Component({
  imports: [MarkedCard],
  template: `<li uiMarkedCard [mark]="mark()"><p>Body</p></li>`,
})
class Host {
  readonly mark = signal<Glyph | null>(mapPinIcon);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const card = (fixture.nativeElement as HTMLElement).querySelector(
    'li',
  ) as HTMLElement;
  return { fixture, card };
}

describe('MarkedCard', () => {
  it('draws a card with the glyph before its content', async () => {
    const { card } = await render();

    expect(card.classList).toContain('bg-white');
    expect(card.firstElementChild?.tagName).toBe('UI-ICON');
    expect(card.textContent).toContain('Body');
  });

  it('is a plain card without a mark', async () => {
    const { fixture, card } = await render();
    fixture.componentInstance.mark.set(null);
    await fixture.whenStable();

    expect(card.querySelector('ui-icon')).toBeNull();
    expect(card.textContent).toContain('Body');
  });
});
