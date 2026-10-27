import { computed, Directive, input } from '@angular/core';
import { ButtonBox } from './button-box';

/*
 * Tailwind's preflight resets <button> to the default cursor, so
 * `cursor-pointer` is spelled out to match the <a> uses.
 *
 * Focus carries no classes at all: the app's one focus outline is a base rule
 * in styles.css, so a button looks focused exactly like a link or a field.
 */
/*
 * `[&>*]:shrink-0` is for the glyph a button sometimes leads with. A wrapping
 * label makes the text an anonymous flex item that competes with the icon for
 * the row, and the icon — being an ordinary flex item — is what gives way: an
 * "Add to cart" that wrapped to two lines squeezed its basket to an oval.
 */
/*
 * `select-none` because a label is part of the control, not text on the page:
 * a drag that starts on a button and ends past it used to leave the label
 * highlighted, and a double-press on a phone selected the word instead of
 * pressing twice. The same applies to every other thing here you press or that
 * merely names a state — see IconButton, DiscButton, Switch, the segments and
 * the badges. Running content is untouched.
 */
const base = `cursor-pointer transition-colors select-none
              disabled:cursor-not-allowed
              [&>*]:shrink-0`;

/*
 * Press deepens rather than lightens: hover goes outward to accent, press goes
 * down to `primary-press`. It has to be a shade of its own rather than the
 * resting colour — a press that merely undoes the hover reads as a press only
 * to a cursor that was hovering, and a finger never hovers, so on a phone the
 * whole press was invisible. Every variant therefore ends up somewhere it has
 * not already been: a fill darkens, an outline gains one.
 */
const variants = {
  // The one variant with a disabled look of its own: it is the variant a page
  // puts its single action in, and that is the button a page has a reason to
  // switch off — an order that cannot be placed, a product that is off the
  // shelf. The fill has to go, or a button that refuses the press still
  // invites it.
  primary: `bg-primary text-white
            hover:bg-accent
            active:bg-primary-press
            disabled:bg-surface-strong disabled:text-ink-subtle
            disabled:hover:bg-surface-strong disabled:active:bg-surface-strong`,
  // Hover recolors border and text rather than the background: this variant
  // appears both on the white page and inside `surface` blocks (the
  // signed-in bar), where a grey background change is invisible. Accent is the app's
  // interactive-hover color throughout.
  secondary: `border border-edge-strong text-ink
              hover:border-accent hover:text-accent
              active:border-primary active:bg-primary/10 active:text-primary`,
  danger: 'bg-danger text-white hover:bg-danger-hover active:bg-danger-press',
  /**
   * The way *into* a destructive flow — a link that only opens the page
   * explaining what would be lost. Outlined like secondary so it stays a
   * navigation, red so it reads as one of these, and filling on hover so the
   * solid variant above is left to the click that cannot be taken back.
   */
  dangerOutline: `border border-danger-edge-strong text-danger
                  hover:border-danger hover:bg-danger hover:text-white
                  active:border-danger-press active:bg-danger-press
                  active:text-white`,
  /**
   * Chromeless until hovered — for controls that repeat in a row and would be
   * noisy as outlined buttons: pagination, table row actions.
   */
  ghost: `text-ink
          hover:bg-surface-subtle-hover hover:text-accent
          active:bg-surface-subtle-press active:text-primary`,
} as const;

/**
 * Styling-only button directive (shadcn-style owned primitive): applies the
 * design system's button look to native <button> and <a> elements, keeping
 * their built-in semantics and router integration.
 *
 *   <a appButton routerLink="/about">About us</a>
 *   <button appButton variant="secondary">Cancel</button>
 *   <a appButton variant="ghost" size="sm" [routerLink]="…">Next</a>
 */
@Directive({
  selector: '[appButton]',
  hostDirectives: [{ directive: ButtonBox, inputs: ['size'] }],
  host: { '[class]': 'classes()' },
})
export class Button {
  variant = input<keyof typeof variants>('primary');

  protected classes = computed(() => `${base} ${variants[this.variant()]}`);
}
