import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Glyph } from './glyph';
import { Icon } from './icon';
import { xIcon } from './glyphs/x';

@Component({
  imports: [Icon],
  template: `<app-icon [glyph]="glyph()" />`,
})
class Host {
  readonly glyph = signal<Glyph>(xIcon);
}

async function render(glyph: Glyph) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.glyph.set(glyph);
  await fixture.whenStable();
  fixture.detectChanges();
  const svg = (fixture.nativeElement as HTMLElement).querySelector(
    'svg',
  ) as SVGSVGElement;
  return { fixture, svg };
}

describe('Icon', () => {
  it('draws every node of the glyph, in order, with its attributes', async () => {
    const { svg } = await render([
      { tag: 'path', d: 'M5 12h14' },
      { tag: 'circle', cx: 12, cy: 12, r: 0.5, fill: 'currentColor' },
      { tag: 'rect', width: 18, height: 11, x: 3, y: 11, rx: 2 },
      { tag: 'line', x1: 10, x2: 10, y1: 11, y2: 17 },
      { tag: 'polygon', points: '22 3 2 3 10 12.46' },
      { tag: 'polyline', points: '3.29 7 12 12 20.71 7' },
    ]);

    const [path, circle, rect, line, polygon, polyline] = Array.from(
      svg.children,
    );
    expect(svg.children).toHaveLength(6);
    expect(path.localName).toBe('path');
    expect(path.getAttribute('d')).toBe('M5 12h14');
    expect(circle.getAttribute('r')).toBe('0.5');
    expect(circle.getAttribute('fill')).toBe('currentColor');
    expect(rect.getAttribute('rx')).toBe('2');
    expect(line.getAttribute('y2')).toBe('17');
    expect(polygon.getAttribute('points')).toBe('22 3 2 3 10 12.46');
    expect(polyline.localName).toBe('polyline');
  });

  it('leaves an unset optional attribute off, so the SVG default applies', async () => {
    const { svg } = await render([
      { tag: 'circle', cx: 12, cy: 12, r: 10 },
      { tag: 'rect', width: 18, height: 18, x: 3, y: 3 },
    ]);

    const [circle, rect] = Array.from(svg.children);
    expect(circle.hasAttribute('fill')).toBe(false);
    expect(rect.hasAttribute('rx')).toBe(false);
  });

  it('redraws when given another glyph', async () => {
    const { fixture, svg } = await render(xIcon);

    fixture.componentInstance.glyph.set([{ tag: 'path', d: 'M5 12h14' }]);
    fixture.detectChanges();

    expect(svg.children).toHaveLength(1);
    expect(svg.children[0].getAttribute('d')).toBe('M5 12h14');
  });

  it('is hidden from assistive technology', async () => {
    const { svg } = await render(xIcon);

    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
