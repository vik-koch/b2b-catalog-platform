import { computed, Directive, input } from '@angular/core';

// See Button for the cursor and focus-outline reasoning.
const base =
  'inline-flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed';

/**
 * A disc that lifts off whatever it sits on, or the bare glyph.
 *
 * The disc is the admin affordance: it appears *over* content — a tile, a
 * photo, a page corner — and needs its own surface to be legible there. Inside
 * a line of content the surface is what makes it read as a second control
 * beside the one it belongs to, so a storefront control (the cart's bin, the
 * note button) takes the glyph alone.
 */
const shapes = {
  circle: 'rounded-full bg-surface p-2 shadow-sm ring-1 ring-border',
  plain: 'rounded-md p-1',
} as const;

const variants = {
  default: 'text-muted hover:text-accent active:text-primary',
  /** A control whose glyph already says something has been set. */
  marked: 'text-primary hover:text-accent',
  danger: 'text-muted hover:text-red-700',
} as const;

/**
 * Styling-only directive for an icon button — the edit-mode edit/delete
 * affordances across the storefront (product page, category grid tiles, catalog
 * overview) and the icon-sized controls inside a product line. Applies to
 * <button> and <a> so links and actions look identical, keeping their native
 * semantics and router integration.
 *
 *   <a appIconButton routerLink="…"><app-icon name="pencil" /></a>
 *   <button appIconButton shape="plain" variant="danger" (click)="…">…</button>
 */
@Directive({
  selector: '[appIconButton]',
  host: { '[class]': 'classes()' },
})
export class IconButton {
  variant = input<keyof typeof variants>('default');
  shape = input<keyof typeof shapes>('circle');

  protected classes = computed(
    () => `${base} ${shapes[this.shape()]} ${variants[this.variant()]}`,
  );
}
