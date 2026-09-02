import { computed, Directive, input } from '@angular/core';

// See Button for the cursor and focus-outline reasoning.
const base =
  'inline-flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed';

/**
 * How much room the glyph gets — the padding *and* the glyph, because the two
 * only ever change together and a call site that set one without the other was
 * the bug this fixes.
 *
 * Both are roomier below `md`, where the pointer is a finger: a 16px glyph with
 * 4px around it is a 24px target, under half of what a thumb actually lands on,
 * and these sit in rows of two or three beside each other. Sizing the glyph
 * from here is what makes that true everywhere without eleven call sites
 * remembering to say so.
 */
const sizes = {
  sm: 'p-2 [&>*]:size-5 md:p-1 md:[&>*]:size-4',
  md: 'p-2.5 [&>*]:size-6 md:p-1.5 md:[&>*]:size-5',
  /**
   * The one that leads a record row. No padding on the sides, so the glyph's
   * own left edge is the row's left edge and everything under it — the meta
   * line, the second line of a wrapped name — starts on the same vertical. It
   * keeps the height, which is what a thumb aims at.
   */
  lead: 'px-0 py-2 [&>*]:size-5 md:py-1 md:[&>*]:size-4',
  /**
   * The finger-sized end of `sm`, held at every width. For a control whose
   * neighbours are laid out by a *container* query rather than by the window:
   * the storefront's filter disclosure is still the phone's shape on a
   * thousand-pixel window, and the glyph beside it shrank to the desktop size
   * a whole breakpoint before the panel it belongs to changed shape.
   */
  touch: 'p-2 [&>*]:size-5',
} as const;

const variants = {
  /**
   * One weight for every icon button in the app. Lighter than any text it sits
   * beside, because these repeat — a list of two hundred rows carries six
   * hundred of them, and at text weight the glyphs shout down the values they
   * belong to. There was briefly a second, subtler variant for exactly that
   * case; two weights of the same control read as two controls, so this is the
   * lighter of them and the only one.
   */
  default: 'text-stone-400 hover:text-accent active:text-primary-deep',
  /** A control whose glyph already says something has been set. */
  marked: 'text-primary hover:text-accent active:text-primary-deep',
  danger: 'text-stone-400 hover:text-red-700 active:text-red-900',
} as const;

/**
 * Styling-only directive for an icon button — a glyph-sized control sitting
 * inside a line of content: a row's actions in an admin grid, the bin on a cart
 * line, the edit and delete beside a saved address. Applies to <button> and <a>
 * so links and actions look identical, keeping their native semantics and
 * router integration.
 *
 *   <a appIconButton routerLink="…"><app-icon name="pencil" /></a>
 *   <button appIconButton variant="danger" (click)="…">…</button>
 *
 * The glyph needs no size of its own — see the sizes above. For the disc laid
 * over content in edit mode, see DiscButton.
 */
@Directive({
  selector: '[appIconButton]',
  host: { '[class]': 'classes()' },
})
export class IconButton {
  variant = input<keyof typeof variants>('default');
  size = input<keyof typeof sizes>('sm');

  protected classes = computed(
    () =>
      `${base} rounded-md ${sizes[this.size()]} ${variants[this.variant()]}`,
  );
}
