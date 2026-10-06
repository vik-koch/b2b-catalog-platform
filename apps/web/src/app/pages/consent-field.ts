import { Component, computed, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { consentLabelParts } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Checkbox } from '../ui/checkbox';
import { Link } from '../ui/link';
import { ConsentRequest } from './consent';
import { PrivacyNotice } from './privacy-notice';

let nextId = 0;

/**
 * The consent box (NFR-LEGAL-09): unticked until the person ticks it, worded
 * by the consent text's current version, whose bracketed words link that text.
 * The privacy notice follows in the same sentence run but outside the label:
 * it is information, not part of what is ticked, so it is no part of the
 * box's accessible name either. Where no consent is asked, only the notice
 * shows, unless the form opts out of that.
 *
 * Links open a new tab: following one in place would throw away what the
 * person has typed into the form.
 */
@Component({
  selector: 'app-consent-field',
  imports: [ReactiveFormsModule, RouterLink, Checkbox, Link, PrivacyNotice],
  host: { class: 'block empty:hidden' },
  template: `
    @if (consent().state() === 'ready') {
      <div class="flex items-start gap-2 text-sm">
        <!-- Sized explicitly so the nudge is exact: a 16px box in the 20px
             line box of text-sm sits 2px down. -->
        <input
          [id]="id"
          type="checkbox"
          appCheckbox
          [formControl]="consent().control"
          class="mt-0.5 shrink-0"
          aria-required="true"
          [attr.aria-invalid]="invalid() || null"
          [attr.aria-labelledby]="id + '-text'"
        />
        <p>
          <!-- The link is not inside a label. A browser hovers a labelled
               control whenever its label is hovered, so a link inside one lit
               the box as if pointing at the link meant ticking it. The words
               around it are labels of their own, so clicking them still ticks
               the box, and the box takes its name from the whole sentence. -->
          <span [id]="id + '-text'">
            @if (parts(); as parts) {
              <label [for]="id" class="cursor-pointer">{{ parts.before }}</label
              ><a
                appLink
                [routerLink]="consent().path"
                target="_blank"
                rel="noopener"
                >{{ parts.link }}</a
              ><label [for]="id" class="cursor-pointer">{{
                parts.after
              }}</label>
            } @else {
              <label [for]="id" class="cursor-pointer">{{
                consent().label()
              }}</label>
            }</span
          ><span class="text-accent" aria-hidden="true">*</span>
          <app-privacy-notice />
        </p>
      </div>
      @if (consent().notice() === 'changed') {
        <p class="mt-1 text-sm text-red-600" role="alert">
          {{ text.changed }}
        </p>
      } @else if (invalid()) {
        <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
      }
    } @else if (alone() && consent().state() !== 'loading') {
      <p class="text-sm"><app-privacy-notice /></p>
    }
    @if (
      consent().state() === 'unavailable' ||
      consent().notice() === 'unavailable'
    ) {
      <p class="mt-1 text-sm text-red-600" role="alert">
        {{ text.unavailable }}
      </p>
    }
  `,
})
export class ConsentField {
  readonly consent = input.required<ConsentRequest>();
  readonly invalid = input(false);
  /** The privacy notice in place of the box, where none is asked. */
  readonly alone = input(true);

  protected readonly id = `consent-${nextId++}`;
  protected readonly text = inject(APP_TEXT).consentBox;
  protected readonly parts = computed(() => {
    const label = this.consent().label();
    return label ? consentLabelParts(label) : null;
  });
}
