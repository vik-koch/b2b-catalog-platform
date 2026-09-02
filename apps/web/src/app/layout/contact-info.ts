import { Component, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Icon } from '../ui/icons/icon';

/**
 * Phone/email as pills with tel:/mailto: links. Each is shown only when
 * configured (FR-NAV-05), so the same component works wherever a deployment
 * puts it regardless of which fields it sets.
 *
 * One line of it, and it gives ground rather than pushing: the row it sits in
 * — the phone's brand row, the utility bar — has something on the other side
 * that must stay whole. The number is the channel a customer of a shop this
 * size reaches for first, so it is the one that stays.
 *
 * How the address leaves is the wrap: the pills may wrap, the box is one pill
 * tall, and what wraps is clipped. So the address is shown whole or not at
 * all — never as an ellipsis, which reads like an address that has been
 * damaged — and the width it needs is the width of the address this deployment
 * actually configured rather than a number guessed here.
 */
@Component({
  selector: 'app-contact-info',
  imports: [Icon],
  host: {
    class:
      'flex h-7 min-w-0 flex-wrap content-start items-center overflow-hidden',
  },
  template: `
    @if (contact?.phone; as phone) {
      <a [href]="telHref(phone)" [class]="pillClass">
        <app-icon name="phone" class="h-4 w-4" />
        {{ phone }}
      </a>
    }
    @if (contact?.email; as email) {
      <a [href]="'mailto:' + email" [class]="pillClass">
        <app-icon name="mail" class="h-4 w-4" />
        {{ email }}
      </a>
    }
  `,
})
export class ContactInfo {
  protected readonly contact = inject(DEPLOYMENT_CONFIG).contact;

  /** `whitespace-nowrap` so a pill wraps as a whole or not at all — a broken
   * address on two lines would show its first half and clip the rest. */
  protected readonly pillClass =
    'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm whitespace-nowrap text-subtle transition-colors hover:text-accent active:text-primary-deep';

  /** tel: needs dial characters only; the displayed value keeps its spacing. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
