import { Directive, HostAttributeToken, inject } from '@angular/core';
import { Field } from './field';

const own = (name: string) =>
  inject(new HostAttributeToken(name), { optional: true });

/**
 * The control's half of Field: it takes the id the caption points at, and the
 * describedby, required and invalid state the field decides. Sits beside
 * FormField, which binds the value, `required` and `disabled` themselves.
 *
 * Outside a Field it keeps whatever the element says for itself: a host
 * binding to null would remove an attribute written in the template.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector -- rides on FormField's selector, so no control forgets it
  selector: '[formField]',
  host: {
    '[attr.id]': 'shell ? shell.controlId() : ownId',
    '[attr.aria-describedby]':
      'shell ? shell.descriptionIds() : ownDescribedBy',
    // A custom control gets no native `required`, so it is said once here.
    '[attr.aria-required]':
      'shell ? (shell.required() ? true : null) : ownRequired',
    '[attr.aria-invalid]': 'shell ? (shell.error() ? true : null) : ownInvalid',
  },
})
export class FieldBinding {
  protected readonly shell = inject(Field, { optional: true });
  protected readonly ownId = own('id');
  protected readonly ownDescribedBy = own('aria-describedby');
  protected readonly ownRequired = own('aria-required');
  protected readonly ownInvalid = own('aria-invalid');
}
