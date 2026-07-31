import { computed, Directive, input } from '@angular/core';

// See Button: preflight drops the pointer cursor on <button>.
const base =
  'inline-flex cursor-pointer items-center justify-center rounded-full bg-surface p-2 text-stone-600 shadow-sm ring-1 ring-stone-200 transition-colors disabled:cursor-not-allowed';

const variants = {
  default: 'hover:text-accent hover:bg-stone-100 hover:ring-primary/40',
  danger: 'hover:text-red-700 hover:bg-stone-100 hover:ring-primary/40',
} as const;

/**
 * Styling-only directive for a circular icon button — the edit-mode edit/delete
 * affordances across the storefront (product page, category grid tiles, catalog
 * overview). Applies to <button> and <a> so links and actions look identical,
 * keeping their native semantics and router integration.
 *
 *   <a appIconButton routerLink="…"><app-lucide-icon name="pencil" /></a>
 *   <button appIconButton variant="danger" (click)="…"><app-lucide-icon name="trash-2" /></button>
 */
@Directive({
  selector: '[appIconButton]',
  host: { '[class]': 'classes()' },
})
export class IconButton {
  variant = input<keyof typeof variants>('default');

  protected classes = computed(() => `${base} ${variants[this.variant()]}`);
}
