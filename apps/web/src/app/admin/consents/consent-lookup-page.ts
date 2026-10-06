import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CONSENT_WITHDRAWAL_NOTE_MAX,
  ConsentRecord,
  fillText,
  FindConsentsQuery,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import {
  canonicalPhone,
  emailFormat,
  formatPhone,
  phoneValidators,
  typedPhone,
} from '../../core/contact-fields';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { EmailField } from '../../ui/email-field';
import { PhoneField } from '../../ui/phone-field';
import { Segmented, SegmentOption } from '../../ui/segmented';
import { ConfirmService } from '../../ui/confirm.service';
import { Skeleton } from '../../ui/skeleton';
import { adminDayFormat } from '../grid/admin-date';
import { ConsentRecordList } from './consent-record-list';
import { ConsentsService } from './consents.service';

type SearchBy = 'email' | 'phone';

/**
 * Whose consents (NFR-LEGAL-09): an email address or a phone number in, the
 * records naming it out. The search lives in the address bar, so a result can
 * be reloaded, sent to a colleague, or come back to from an account it links.
 */
@Component({
  selector: 'app-consent-lookup-page',
  imports: [
    ReactiveFormsModule,
    Button,
    EmailField,
    PhoneField,
    Segmented,
    Skeleton,
    ConsentRecordList,
  ],
  template: `
    <div class="max-w-3xl">
      <h1 class="text-3xl font-medium tracking-tight">{{ text.title }}</h1>
      <p class="mt-2 text-muted">{{ text.intro }}</p>

      <form class="mt-6 space-y-4" novalidate (submit)="search($event)">
        <app-segmented [options]="searchOptions" size="md" [formControl]="by" />
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            @if (searchBy() === 'email') {
              <app-email-field
                [control]="emailField"
                [label]="text.byEmail"
                [text]="emailText"
                [marker]="false"
                [invalid]="invalid()"
                autocomplete="off"
              />
            } @else {
              <app-phone-field
                [control]="phoneField"
                [label]="text.byPhone"
                [text]="phoneText"
                [marker]="false"
                [invalid]="invalid()"
                autocomplete="off"
              />
            }
          </div>
        </div>
        <button appButton type="submit">{{ text.search }}</button>
      </form>

      <div class="mt-8">
        @if (results.error()) {
          <p class="text-muted" role="alert">{{ text.loadError }}</p>
        } @else if (results.hasValue() && query(); as asked) {
          @if (withdrawError(); as message) {
            <p class="mb-4 text-sm text-red-700" role="alert">{{ message }}</p>
          }
          @if (results.value().length > 0) {
            <app-consent-record-list
              [records]="results.value()"
              [withdrawable]="true"
              (withdraw)="withdraw($event)"
            />
          } @else {
            <p class="text-muted">{{ emptyLine(asked) }}</p>
          }
        } @else if (showSkeleton()) {
          <app-skeleton [lines]="4" />
        }
      </div>
    </div>
  `,
})
export class ConsentLookupPage {
  private readonly service = inject(ConsentsService);
  private readonly confirm = inject(ConfirmService);
  private readonly dayFormat = adminDayFormat(
    inject(DEPLOYMENT_CONFIG).catalog.currency.locale,
  );
  /** Why the last withdrawal was not saved, until the next one is tried. */
  protected readonly withdrawError = signal<string | null>(null);
  private readonly router = inject(Router);
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  protected readonly text = inject(ADMIN_TEXT).consents;
  private readonly common = inject(ADMIN_TEXT).common;
  private readonly validation = inject(ADMIN_TEXT).userEditor.validation;
  protected readonly emailText = {
    required: this.validation.emailRequired,
    invalid: this.validation.emailInvalid,
  };
  protected readonly phoneText = {
    incomplete: this.validation.phoneIncomplete,
  };

  /** From the query string, by input binding; absent arrives as undefined. */
  readonly email = input<string | undefined>();
  readonly phone = input<string | undefined>();

  protected readonly searchOptions: SegmentOption<SearchBy>[] = [
    { value: 'email', label: this.text.byEmail },
    { value: 'phone', label: this.text.byPhone },
  ];
  protected readonly by = new FormControl<SearchBy>('email', {
    nonNullable: true,
  });
  // Mirrored, because a FormControl's value is not a signal.
  protected readonly searchBy = signal<SearchBy>('email');
  // Format only: an empty box searches for nothing, which needs no sentence.
  protected readonly emailField = new FormControl('', {
    nonNullable: true,
    validators: [emailFormat()],
  });
  protected readonly phoneField = new FormControl('', {
    nonNullable: true,
    validators: phoneValidators(this.phoneInput, false),
  });
  /** Set by a search the field refused, so it says why. */
  protected readonly invalid = signal(false);

  /** What the address bar asks for: one of the two, never both. */
  protected readonly query = computed<FindConsentsQuery | null>(() => {
    const email = this.email()?.trim();
    if (email) return { email };
    const phone = this.phone()?.trim();
    return phone ? { phone } : null;
  });

  protected readonly results = resource({
    params: () => this.query() ?? undefined,
    loader: ({ params }) => this.service.find(params),
  });
  protected readonly showSkeleton = delayedLoading(this.results.isLoading);

  constructor() {
    usePageSeo({ name: () => this.text.title });
    this.by.valueChanges.subscribe((by) => {
      this.searchBy.set(by);
      this.invalid.set(false);
    });
    // A search opened from a link fills the form it would have been typed
    // into, so changing it starts from what is shown.
    effect(() => {
      const query = this.query();
      if (!query) return;
      if (query.phone) {
        this.by.setValue('phone');
        this.phoneField.setValue(typedPhone(query.phone, this.phoneInput));
      } else {
        this.by.setValue('email');
        this.emailField.setValue(query.email ?? '');
      }
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    const field =
      this.searchBy() === 'email' ? this.emailField : this.phoneField;
    if (!field.value.trim()) return;
    this.invalid.set(field.invalid);
    if (field.invalid) return;
    const queryParams =
      this.searchBy() === 'email'
        ? { email: this.emailField.value.trim().toLowerCase() }
        : { phone: canonicalPhone(this.phoneField.value, this.phoneInput) };
    void this.router.navigate([], { queryParams });
  }

  /**
   * A withdrawal that reached the shop from outside, entered against its
   * record. Asked first, since it cannot be taken back; the note says how it
   * arrived, which is what an inspection asks next.
   */
  protected async withdraw(record: ConsentRecord): Promise<void> {
    this.withdrawError.set(null);
    const holder =
      record.email ?? formatPhone(record.phone, this.phoneInput) ?? '';
    const answer = await this.confirm.askDetailed({
      heading: this.text.withdrawTitle,
      message: fillText(this.text.withdrawConfirm, {
        holder,
        date: this.dayFormat.format(new Date(record.givenAt)),
      }),
      // The platform holds the record, not the inquiry: that is a mail in
      // the shop's inbox, and only a person can delete it there.
      warning: this.text.withdrawInbox,
      confirmLabel: this.text.withdraw,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
      reasonLabel: this.text.withdrawNote,
      reasonMaxLength: CONSENT_WITHDRAWAL_NOTE_MAX,
      // Worth having, not worth blocking a withdrawal over.
      reasonRequired: false,
    });
    if (!answer) return;

    try {
      const result = await this.service.withdraw(
        record.id,
        answer.reason ?? '',
      );
      if (result.ok) {
        this.results.update((list) =>
          list?.map((r) => (r.id === result.record.id ? result.record : r)),
        );
        return;
      }
      this.withdrawError.set(this.text.withdrawErrors[result.code]);
      // Whatever changed under the list, show it as it now stands.
      this.results.reload();
    } catch {
      this.withdrawError.set(this.text.withdrawError);
    }
  }

  protected emptyLine(query: FindConsentsQuery): string {
    const shown = query.email ?? formatPhone(query.phone, this.phoneInput);
    return fillText(this.text.empty, { query: shown });
  }
}
