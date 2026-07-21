import { Component, computed, inject, input } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { MailIcon } from '../ui/icons/mail-icon';
import { PhoneIcon } from '../ui/icons/phone-icon';

/**
 * Phone/email as pills with tel:/mailto: links. Each is shown only when
 * configured (FR-NAV-05), so the same component works in the header bar and the
 * footer regardless of which fields a deployment sets. `variant` switches the
 * look between the header (primary tint) and footer (plain on a gray surface).
 */
@Component({
  selector: 'app-contact-info',
  imports: [PhoneIcon, MailIcon],
  host: { class: 'flex flex-wrap items-center gap-3' },
  template: `
    @if (contact?.phone; as phone) {
      <a [href]="telHref(phone)" [class]="pillClass()">
        <app-icon-phone class="h-4 w-4" />
        {{ phone }}
      </a>
    }
    @if (contact?.email; as email) {
      <a [href]="'mailto:' + email" [class]="pillClass()">
        <app-icon-mail class="h-4 w-4" />
        {{ email }}
      </a>
    }
  `,
})
export class ContactInfo {
  protected readonly contact = inject(DEPLOYMENT_CONFIG).contact;

  /** 'primary' for the header bar; 'plain' (white/ink) for the gray footer. */
  readonly variant = input<'primary' | 'plain'>('primary');

  protected readonly pillClass = computed(() => {
    const base =
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors';
    return this.variant() === 'plain'
      ? `${base} border border-stone-200 bg-white text-ink hover:bg-stone-100`
      : `${base} bg-primary/10 text-primary hover:bg-primary/20`;
  });

  /** tel: needs dial characters only; the displayed value keeps its spacing. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
