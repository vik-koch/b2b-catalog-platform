import { computed, Directive, input } from '@angular/core';

// Tailwind's preflight resets <button> to the default cursor, so buttons need
// `cursor-pointer` spelled out to feel clickable the way the <a> uses do.
const base =
  'inline-flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed';

const variants = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  // Hover recolors border and text rather than the background: this variant
  // appears both on the white page and inside stone-100 blocks (the signed-in
  // bar), where a stone background change is invisible. Accent is the app's
  // interactive-hover color throughout.
  secondary:
    'border border-stone-300 text-ink hover:border-accent hover:text-accent',
  danger: 'bg-red-700 text-white hover:bg-red-800',
} as const;

/**
 * Styling-only button directive (shadcn-style owned primitive): applies the
 * design system's button look to native <button> and <a> elements, keeping
 * their built-in semantics and router integration.
 *
 *   <a appButton routerLink="/about">About us</a>
 *   <button appButton variant="secondary">Cancel</button>
 */
@Directive({
  selector: '[appButton]',
  host: { '[class]': 'classes()' },
})
export class Button {
  variant = input<keyof typeof variants>('primary');

  protected classes = computed(() => `${base} ${variants[this.variant()]}`);
}
