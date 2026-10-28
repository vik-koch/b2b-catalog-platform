import { computed, Directive, input } from '@angular/core';

/**
 * The hairline around a photo on a white ground, or around the card one sits
 * on. A ring, painted outside the box: an inset ring is eaten by the photo's
 * antialiased corners, and a border costs a pixel of layout on each side.
 * `ring` rather than a bare shadow, so it composes with a card's hover shadow.
 */
const rest = 'ring-1 ring-edge';

/**
 * The chosen one of several, heavier as well as coloured, so it is found on a
 * page of photos that may share the colour. It grows outwards, so the photo
 * inside keeps its size.
 */
const selected = 'bg-primary ring-2 ring-primary';

const pressable = 'hover:bg-accent hover:ring-accent';

/**
 * The frame on a photo or its card. `pressable` where the framed thing is a
 * control, chosen or not.
 *
 *   <a uiFrame class="block rounded-md" …><img … /></a>
 *   <button uiFrame [selected]="i === current()" [pressable]="true">…</button>
 */
@Directive({
  selector: '[uiFrame]',
  host: { '[class]': 'classes()' },
})
export class Frame {
  readonly selected = input(false);
  readonly pressable = input(false);

  protected readonly classes = computed(
    () =>
      `${this.selected() ? selected : rest} ${this.pressable() ? pressable : ''}`,
  );
}
