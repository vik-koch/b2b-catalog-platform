import { Component, inject } from '@angular/core';

import { mailIcon } from '@b2b-catalog-platform/ui/icons/glyphs/mail';
import { phoneIcon } from '@b2b-catalog-platform/ui/icons/glyphs/phone';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';

import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';

/** Dial characters only; the shown number keeps its spacing. */
export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

export function mailHref(email: string): string {
  return `mailto:${email}`;
}

/**
 * The configured phone and email as pills (FR-NAV-05), on one line that gives
 * ground: the box is one pill tall and a wrapped pill is clipped, so the
 * address shows whole or not at all, and the number, listed first, stays.
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
        <ui-icon [glyph]="phoneIcon" class="size-4" />
        {{ phone }}
      </a>
    }
    @if (contact?.email; as email) {
      <a [href]="mailHref(email)" [class]="pillClass">
        <ui-icon [glyph]="mailIcon" class="size-4" />
        {{ email }}
      </a>
    }
  `,
})
export class ContactInfo {
  protected readonly mailIcon = mailIcon;
  protected readonly phoneIcon = phoneIcon;
  protected readonly contact = inject(DEPLOYMENT_CONFIG).contact;

  /** `whitespace-nowrap`, so a pill wraps whole. */
  protected readonly pillClass = `inline-flex items-center gap-1.5
                                  rounded-full px-2 py-1 text-sm
                                  whitespace-nowrap text-ink-subtle
                                  transition-colors
                                  hover:text-accent
                                  active:text-primary-press`;

  protected readonly telHref = telHref;
  protected readonly mailHref = mailHref;
}
