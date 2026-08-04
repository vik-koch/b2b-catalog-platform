import { Component, computed, inject, input } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Icon } from '../ui/icons/icon';

/**
 * Phone/email as pills with tel:/mailto: links. Each is shown only when
 * configured (FR-NAV-05), so the same component works in the header bar and the
 * footer regardless of which fields a deployment sets. `variant` switches the
 * look between the header (primary tint) and footer (plain on a gray surface).
 */
@Component({
  selector: 'app-contact-info',
  imports: [Icon],
  host: { class: 'flex flex-wrap items-center gap-4' },
  template: `
    @if (contact?.phone; as phone) {
      <a [href]="telHref(phone)" [class]="pillClass()">
        @if (this.variant() === 'primary') {
          <app-icon name="phone" class="h-4 w-4" />
        }
        {{ phone }}
      </a>
    }
    @if (contact?.email; as email) {
      <a [href]="'mailto:' + email" [class]="pillClass()">
        @if (this.variant() === 'primary') {
          <app-icon name="mail" class="h-4 w-4" />
        }
        {{ email }}
      </a>
    }
  `,
})
export class ContactInfo {
  protected readonly contact = inject(DEPLOYMENT_CONFIG).contact;

  /** 'primary' for the pill design, 'plain': simple text */
  readonly variant = input<'primary' | 'plain'>('primary');

  protected readonly pillClass = computed(() => {
    return this.variant() === 'primary'
      ? `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors border border-border bg-white text-ink hover:text-accent hover:ring-primary/40`
      : `text-sm text-subtle transition-colors hover:text-accent`;
  });

  /** tel: needs dial characters only; the displayed value keeps its spacing. */
  protected telHref(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
