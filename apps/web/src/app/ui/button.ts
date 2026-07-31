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
  'inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed';

const sizes = {
  md: 'px-4 py-2',
  /** Dense rows: pagination, table row actions. */
  sm: 'px-3 py-1.5',
} as const;

const variants = {
  primary: 'bg-primary text-white hover:bg-accent',
  // Hover recolors border and text rather than the background: this variant
  // appears both on the white page and inside stone-100 blocks (the signed-in
  // bar), where a stone background change is invisible. Accent is the app's
  // interactive-hover color throughout.
  secondary:
    'border border-border-strong text-ink hover:border-accent hover:text-accent',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  /**
   * Chromeless until hovered — for controls that repeat in a row and would be
   * noisy as outlined buttons: pagination, table row actions.
   */
  ghost: 'text-stone-700 hover:bg-stone-100 hover:text-accent',
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
