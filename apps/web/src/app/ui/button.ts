import { computed, Directive, input } from '@angular/core';

/*
 * Tailwind's preflight resets <button> to the default cursor, so
 * `cursor-pointer` is spelled out to match the <a> uses.
 *
 * Focus carries no classes at all: the app's one focus outline is a base rule
 * in styles.css, so a button looks focused exactly like a link or a field.
 */
const base =
  'inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed';

const sizes = {
  md: 'px-4 py-2',
  /** Dense rows: pagination, table row actions. */
  sm: 'px-3 py-1.5',
} as const;

/*
 * Press deepens rather than lightens: hover goes outward to accent, press goes
 * down to `primary-deep`. It has to be a shade of its own rather than the
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
  primary:
    'bg-primary text-white hover:bg-accent active:bg-primary-deep disabled:bg-stone-200 disabled:text-stone-500 disabled:hover:bg-stone-200 disabled:active:bg-stone-200',
  // Hover recolors border and text rather than the background: this variant
  // appears both on the white page and inside stone-100 blocks (the signed-in
  // bar), where a stone background change is invisible. Accent is the app's
  // interactive-hover color throughout.
  secondary:
    'border border-border-strong text-ink hover:border-accent hover:text-accent active:border-primary active:bg-primary/10 active:text-primary',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
  /**
   * The way *into* a destructive flow — a link that only opens the page
   * explaining what would be lost. Outlined like secondary so it stays a
   * navigation, red so it reads as one of these, and filling on hover so the
   * solid variant above is left to the click that cannot be taken back.
   */
  dangerOutline:
    'border border-red-300 text-red-700 hover:border-red-700 hover:bg-red-700 hover:text-white active:border-red-900 active:bg-red-900 active:text-white',
  /**
   * Chromeless until hovered — for controls that repeat in a row and would be
   * noisy as outlined buttons: pagination, table row actions.
   */
  ghost:
    'text-stone-700 hover:bg-stone-100 hover:text-accent active:bg-stone-200 active:text-primary',
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
  host: { '[class]': 'classes()' },
})
export class Button {
  variant = input<keyof typeof variants>('primary');
  size = input<keyof typeof sizes>('md');

  protected classes = computed(
    () => `${base} ${sizes[this.size()]} ${variants[this.variant()]}`,
  );
}
