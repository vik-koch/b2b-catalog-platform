import { Component, input } from '@angular/core';
import { Glyph } from './glyph';

/**
 * Draws one glyph (see `glyph.ts`). The component holds no glyphs itself, so
 * any chunk may use it: what a page downloads is the glyphs it imports.
 *
 *   import { searchIcon } from '@b2b-catalog-platform/ui/icons/glyphs/search';
 *   protected readonly searchIcon = searchIcon;
 *   <app-icon [glyph]="searchIcon" class="size-5" />
 *
 * Size via a height/width class on the element, or from the control around it
 * through `--icon-size` (IconButton does); colour follows `currentColor`.
 * Decorative: the control around it carries the name.
 */
@Component({
  selector: 'app-icon',
  host: { class: 'inline-flex' },
  // Set as a property rather than as the SVG's own stroke-width attribute: a
  // presentation attribute on the element beats any value inherited from an
  // ancestor, so a caller asking for a heavier glyph would be ignored. As a
  // custom property it inherits, and anything above the icon can raise it.
  //
  // The size is here, in the component's own styles, because a server-rendered
  // page paints first with only the critical CSS picked from the full sheet,
  // and a class naming its children (`[&>*]:size-5`) is never picked: the
  // server writes its `&` as `&amp;`, which the picker does not match. So the
  // glyph filled its button until the stylesheet arrived. Component styles
  // always travel with the page. In the components layer, so a size class on
  // the icon itself still wins.
  styles: `
    @layer components {
      :host {
        width: var(--icon-size, 1em);
        height: var(--icon-size, 1em);
      }
    }
    svg {
      stroke-width: var(--icon-stroke-width, 1.75);
    }
  `,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-full"
      aria-hidden="true"
    >
      @for (node of glyph(); track $index) {
        @switch (node.tag) {
          @case ('path') {
            <path [attr.d]="node.d" />
          }
          @case ('circle') {
            <circle
              [attr.cx]="node.cx"
              [attr.cy]="node.cy"
              [attr.r]="node.r"
              [attr.fill]="node.fill"
            />
          }
          @case ('rect') {
            <rect
              [attr.width]="node.width"
              [attr.height]="node.height"
              [attr.x]="node.x"
              [attr.y]="node.y"
              [attr.rx]="node.rx"
              [attr.ry]="node.ry"
            />
          }
          @case ('line') {
            <line
              [attr.x1]="node.x1"
              [attr.x2]="node.x2"
              [attr.y1]="node.y1"
              [attr.y2]="node.y2"
            />
          }
          @case ('polygon') {
            <polygon [attr.points]="node.points" />
          }
          @case ('polyline') {
            <polyline [attr.points]="node.points" />
          }
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly glyph = input.required<Glyph>();
}
