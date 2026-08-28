import { Component, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Icon } from '../ui/icons/icon';

/**
 * Phone/email as pills with tel:/mailto: links. Each is shown only when
 * configured (FR-NAV-05), so the same component works wherever a deployment
 * puts it regardless of which fields it sets.
 */
@Component({
  selector: 'app-contact-info',
  imports: [Icon],
  host: { class: 'flex flex-wrap items-center' },
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

  protected readonly pillClass =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-subtle transition-colors hover:text-accent';

  /** tel: needs dial characters only; the displayed value keeps its spacing. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
