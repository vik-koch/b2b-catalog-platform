import { computed, Directive, input } from '@angular/core';
import { ButtonBox } from './button-box';

/**
 * `cursor-pointer` because preflight resets <button> to the default cursor.
 * No focus classes: the app's one focus outline is a base rule in styles.css.
 * `[&>*]:shrink-0` keeps a leading glyph round when the label wraps;
 * `select-none` keeps a drag or a double tap from selecting the label.
 */
const base = `cursor-pointer transition-colors select-none
              disabled:cursor-not-allowed
              [&>*]:shrink-0`;

const variants = {
  /**
   * The only variant with a disabled look: it carries a page's one action,
   * and that is the button a page switches off.
   */
  primary: `bg-primary text-white
            hover:bg-accent
            active:bg-primary-press
            disabled:bg-surface-strong disabled:text-ink-subtle`,
  /** Hover recolours border and text: a grey fill would vanish on `surface`. */
  secondary: `border border-edge-strong text-ink
              hover:border-accent hover:text-accent
              active:border-primary active:bg-primary/10 active:text-primary`,
  danger: 'bg-danger text-white hover:bg-danger-hover active:bg-danger-press',
  /** The way into a destructive flow; the solid `danger` is the final click. */
  dangerOutline: `border border-danger-edge-strong text-danger
                  hover:border-danger hover:bg-danger hover:text-white
                  active:border-danger-press active:bg-danger-press
                  active:text-white`,
  /** Chromeless until hovered, for controls repeated in a row. */
  ghost: `text-ink
          hover:bg-surface-subtle-hover hover:text-accent
          active:bg-surface-subtle-press active:text-primary`,
} as const;

/**
 * The button look on a native <button> or <a>, which keeps its own semantics
 * and router behaviour.
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
  readonly variant = input<keyof typeof variants>('primary');

  protected classes = computed(() => `${base} ${variants[this.variant()]}`);
}
