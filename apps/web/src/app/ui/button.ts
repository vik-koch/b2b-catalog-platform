import { computed, Directive, input } from '@angular/core';

const base =
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-colors';

const variants = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  secondary: 'border border-stone-300 text-ink hover:bg-stone-100',
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
