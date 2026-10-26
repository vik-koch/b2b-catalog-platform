import { computed, Directive, HostAttributeToken, inject } from '@angular/core';
import { Field } from './field';

/**
 * The control's half of Field: it takes the id the caption points at, and the
 * describedby, required and invalid state the field decides. Sits beside
 * FormField, which binds the value, `required` and `disabled` themselves.
 * Outside a Field it leaves the element's own id alone.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector -- rides on FormField's selector, so no control forgets it
  selector: '[formField]',
  host: {
    '[attr.id]': 'id()',
    '[attr.aria-describedby]': 'control() ? shell?.describedBy() : null',
    // A custom control gets no native `required`, so it is said once here.
    '[attr.aria-required]': 'control() && shell?.required() ? true : null',
    '[attr.aria-invalid]': 'control() && shell?.error() ? true : null',
  },
})
export class FieldBinding {
  protected readonly shell = inject(Field, { optional: true });
  private readonly ownId = inject(new HostAttributeToken('id'), {
    optional: true,
  });

  /** A group's fieldset carries the wiring; its inputs do not. */
  protected readonly control = computed(
    () => !!this.shell && !this.shell.group(),
  );
  protected readonly id = computed(() =>
    this.control() ? this.shell?.controlId() : this.ownId,
  );
}
