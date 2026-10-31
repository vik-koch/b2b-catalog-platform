import { Component, computed, inject, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { consentLabelParts } from '@b2b-catalog-platform/shared/core/site';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { ConsentRequest } from './consent';
import { PrivacyNotice } from './privacy-notice';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { FIELD_ATTEMPT } from '@b2b-catalog-platform/ui/fields/field-attempt';

let nextId = 0;

/**
 * The consent box, worded by the text's current version, its bracketed words
 * linking that text in a new tab. The privacy notice follows outside the
 * label: information, not part of what is ticked or of the box's name.
 */
@Component({
  selector: 'app-consent-field',
  imports: [FormField, RouterLink, Checkbox, Link, PrivacyNotice, ErrorText],
  host: { class: 'block empty:hidden' },
  template: `
    @if (consent().state() === 'ready') {
      <div class="flex items-start gap-2 text-sm">
        <!-- mt-0.5: a 16px box in text-sm's 20px line sits 2px down. -->
        <input
          [id]="id"
          type="checkbox"
          uiCheckbox
          [formField]="consent().field"
          class="mt-0.5 shrink-0"
          aria-required="true"
          [attr.aria-invalid]="shown() || null"
          [attr.aria-labelledby]="id + '-text'"
        />
        <p>
          <!-- The link sits outside the labels: hovering a label hovers its
               box, which made pointing at the link look like ticking it. -->
          <span [id]="id + '-text'">
            @if (parts(); as parts) {
              <label [for]="id" class="cursor-pointer">{{ parts.before }}</label
              ><a
                uiLink
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
        <p uiErrorText class="mt-1" role="alert">
          {{ text.changed }}
        </p>
      } @else if (shown()) {
        <p uiErrorText class="mt-1">{{ text.required }}</p>
      }
    } @else if (alone() && consent().state() !== 'loading') {
      <p class="text-sm"><app-privacy-notice /></p>
    }
    @if (
      consent().state() === 'unavailable' ||
      consent().notice() === 'unavailable'
    ) {
      <p uiErrorText class="mt-1" role="alert">
        {{ text.unavailable }}
      </p>
    }
  `,
})
export class ConsentField {
  readonly consent = input.required<ConsentRequest>();
  /** The privacy notice in place of the box, where none is asked. */
  readonly alone = input(true);

  protected readonly id = `consent-${nextId++}`;
  private readonly attempt = inject(FIELD_ATTEMPT, { optional: true });
  /** Required is all the box can break, so its message waits for a submit. */
  protected readonly shown = computed(
    () => !!this.attempt?.attempted() && this.consent().field().invalid(),
  );
  protected readonly text = inject(STOREFRONT_TEXT).consentBox;
  protected readonly parts = computed(() => {
    const label = this.consent().label();
    return label ? consentLabelParts(label) : null;
  });
}
