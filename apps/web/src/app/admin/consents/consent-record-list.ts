import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CONSENT_PAGE_SLUGS,
  consentLabelParts,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ConsentRecord } from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { formatPhone } from '../../shared/core/contact-fields';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { adminMomentFormat } from '../dates/admin-date';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';

/**
 * Consent records as evidence reads them (NFR-LEGAL-09): what was consented
 * to, the wording that was ticked, when, and whose consent it was. The same
 * list on the lookup and on an account's page; only the lookup names the
 * account, since on the account's page it is the page. A record that has
 * ended says when and how, since its retention runs from there.
 */
@Component({
  selector: 'app-consent-record-list',
  imports: [RouterLink, Icon, IconButton, Link, RecordRow, StatusBadge],
  template: `
    <div class="divide-y divide-edge border-y border-edge">
      @for (record of records(); track record.id) {
        <div class="py-3">
          <ui-record-row [stackMeta]="true">
            <span class="font-medium">{{ text.purposes[record.purpose] }}</span>
            <ng-container recordBadge>
              @if (record.withdrawal) {
                <span uiStatusBadge>{{ text.withdrawn }}</span>
              }
            </ng-container>
            <!-- What was ticked, as it read: the version's own wording, its
                 link marks taken off. -->
            <p recordBody class="mt-1 text-sm">{{ wording(record) }}</p>
            <ng-container recordMeta>
              <span>
                {{ moment(record.givenAt) }} ·
                <a
                  uiLink
                  [routerLink]="['/admin/pages', slugs[record.purpose], 'edit']"
                  >{{ version(record) }}</a
                >
              </span>
              @if (holder(record); as holder) {
                <span class="wrap-break-word">{{ holder }}</span>
              }
              @if (showAccount() && record.account; as account) {
                <span>
                  {{ text.account }}:
                  <a uiLink [routerLink]="['/admin/users', account.id]">{{
                    account.name ?? record.email
                  }}</a>
                </span>
              } @else if (!record.account && record.purpose === 'account') {
                <span>{{ text.accountGone }}</span>
              }
              @if (record.withdrawal; as withdrawal) {
                <span>{{ withdrawnLine(withdrawal) }}</span>
                @if (withdrawal.note) {
                  <span class="wrap-break-word">{{ withdrawal.note }}</span>
                }
              } @else if (record.purpose === 'account' && record.account) {
                <!-- Said rather than offered: there is no line to enter, the
                     account is what ends it. Only while there is an account
                     left to delete. -->
                <span>{{ text.endsWithAccount }}</span>
              }
            </ng-container>
            <ng-container recordActions>
              @if (
                withdrawable() &&
                record.purpose === 'contact' &&
                !record.withdrawal
              ) {
                <button
                  uiIconButton
                  variant="danger"
                  type="button"
                  [attr.aria-label]="text.withdraw"
                  [title]="text.withdraw"
                  (click)="withdraw.emit(record)"
                >
                  <ui-icon [glyph]="circleSlashIcon" />
                </button>
              }
            </ng-container>
          </ui-record-row>
        </div>
      }
    </div>
  `,
})
export class ConsentRecordList {
  protected readonly circleSlashIcon = circleSlashIcon;
  readonly records = input.required<readonly ConsentRecord[]>();
  /** Whether each record names its account, with a link to it. */
  readonly showAccount = input(true);
  /** Whether a contact record still held offers to enter its withdrawal. */
  readonly withdrawable = input(false);
  readonly withdraw = output<ConsentRecord>();

  protected readonly text = inject(ADMIN_TEXT).consents;
  protected readonly slugs = CONSENT_PAGE_SLUGS;

  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly momentFormat = adminMomentFormat(this.config.locale);

  protected moment(iso: string): string {
    return this.momentFormat.format(new Date(iso));
  }

  protected version(record: ConsentRecord): string {
    return fillText(this.text.version, { version: String(record.version) });
  }

  protected wording(record: ConsentRecord): string {
    const label = record.label ?? '';
    const parts = consentLabelParts(label);
    return parts ? parts.before + parts.link + parts.after : label;
  }

  protected withdrawnLine(
    withdrawal: NonNullable<ConsentRecord['withdrawal']>,
  ): string {
    const reason = fillText(this.text.withdrawnReasons[withdrawal.reason], {
      admin: withdrawal.enteredBy ?? '',
    });
    return `${fillText(this.text.withdrawnAt, { date: this.moment(withdrawal.at) })} · ${reason}`;
  }

  /** The address or number the record was given with, as copied then. */
  protected holder(record: ConsentRecord): string {
    return [
      record.email,
      record.phone && formatPhone(record.phone, this.config.phoneInput),
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
