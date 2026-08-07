import { computed, Directive, input } from '@angular/core';

/*
 * Two things worth knowing about the base:
 * - Tailwind's preflight resets <button> to the default cursor, so
 *   `cursor-pointer` is spelled out to match the <a> uses.
 * - Focus is an outline, not a ring: a ring needs a matching ring-offset color
 *   to look right, and these appear on white, on stone-100 and on the primary
 *   fill. An outline with an offset just shows whatever is behind it.
 */
const base =
  'inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed';

const sizes = {
  md: 'px-4 py-2',
  /** Dense rows: pagination, table row actions. */
  sm: 'px-3 py-1.5',
} as const;

/*
 * Press deepens rather than lightens, which is why `active:` lands back on
 * primary instead of on secondary: secondary is the *lighter* roast, so a
 * button that switched to it under the cursor would look like it was rising
 * out of the page at the exact moment it was being pushed into it. Hover goes
 * outward to accent, press comes back down.
 */
const variants = {
  primary: 'bg-primary text-white hover:bg-accent active:bg-primary',
  // Hover recolors border and text rather than the background: this variant
  // appears both on the white page and inside stone-100 blocks (the signed-in
  // bar), where a stone background change is invisible. Accent is the app's
  // interactive-hover color throughout.
  secondary:
    'border border-border-strong text-ink hover:border-accent hover:text-accent active:border-primary active:text-primary',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
  /**
   * The way *into* a destructive flow — a link that only opens the page
   * explaining what would be lost. Outlined like secondary so it stays a
   * navigation, red so it reads as one of these, and filling on hover so the
   * solid variant above is left to the click that cannot be taken back.
   */
  dangerOutline:
    'border border-red-300 text-red-700 hover:border-red-700 hover:bg-red-700 hover:text-white active:bg-red-900 active:border-red-900',
  /**
   * Chromeless until hovered — for controls that repeat in a row and would be
   * noisy as outlined buttons: pagination, table row actions.
   */
  ghost:
    'text-stone-700 hover:bg-stone-100 hover:text-accent active:text-primary',
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
