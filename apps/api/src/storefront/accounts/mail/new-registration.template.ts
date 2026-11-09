import {
  ACCOUNTS_AREA,
  CustomerType,
  formatPersonName,
  type SharedAccountsText,
} from '@b2b-catalog-platform/shared/core/accounts';
import { SharedText } from '@b2b-catalog-platform/shared/platform';

import { accountsMail } from '../../../core/accounts/mail/accounts-mail-text';
import { sharedTextBlock } from '../../../platform/config/shared-text';
import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';

/** The registration, as submitted. */
export interface RegistrationSummary {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly customerType: CustomerType;
  readonly companyName?: string;
  readonly companyRegistrationId?: string;
}

/** Sent to the shop when someone registers (FR-NOTIF-04), linking to the
 * account list where it waits for approval. Every field is repeated: a manager
 * reads it on a phone, matching name and number to a known customer. */
export function newRegistrationMail(
  registration: RegistrationSummary,
  text: MailText,
  common: SharedText,
): MailContent {
  const t = accountsMail(text).newRegistration;
  const fields = common.fields;
  const kinds = sharedTextBlock<SharedAccountsText>(
    common,
    ACCOUNTS_AREA,
  ).partyKind;
  const isCompany = registration.customerType === 'company';

  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [
      {
        // Family name first, as every staff-facing list of people reads.
        label: fields.name.label,
        value: formatPersonName(registration.firstName, registration.lastName),
      },
      { label: fields.email.label, value: registration.email },
      { label: fields.phone.label, value: registration.phone },
      {
        label: t.customerTypeLabel,
        value: isCompany ? kinds.company : kinds.person,
      },
      // Only for a company: a dash for a person would read as missing details.
      // Staff approve on both: the name to match, the number to check.
      ...(isCompany
        ? [
            {
              label: fields.companyName.label,
              value: registration.companyName ?? '',
            },
            {
              label: fields.companyId.label,
              value: registration.companyRegistrationId ?? '',
            },
          ]
        : []),
    ],
    action: { label: t.action, path: '/admin/users' },
  };
}
