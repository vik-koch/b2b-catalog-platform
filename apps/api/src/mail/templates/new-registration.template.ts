import { CustomerType } from '@b2b-catalog-platform/shared';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/** What the staff notification reports — the registration, as submitted. */
export interface RegistrationSummary {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly customerType: CustomerType;
  readonly companyName?: string;
  readonly companyRegistrationId?: string;
}

/**
 * Sent to the shop when someone registers (FR-NOTIF-04). Staff are the only
 * ones who can move the account forward, so this is the one mail that links
 * into the admin panel — the account list, where the pending request waits to
 * be approved and given a tier.
 *
 * It repeats every field the applicant submitted, because this mail is what a
 * manager reads on a phone before deciding whether the name and registration
 * number match a customer they already know.
 */
export function newRegistrationMail(
  registration: RegistrationSummary,
  text: MailText,
): MailContent {
  const t = text.newRegistration;
  const isCompany = registration.customerType === 'company';

  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [
      {
        label: t.nameLabel,
        value: `${registration.firstName} ${registration.lastName}`,
      },
      { label: t.emailLabel, value: registration.email },
      { label: t.phoneLabel, value: registration.phone },
      {
        label: t.customerTypeLabel,
        value: isCompany ? t.customerTypeCompany : t.customerTypePerson,
      },
      // Only for a company: a dash against a private person would read as
      // details that failed to arrive. Both are what staff approve on — the
      // name is what they match against their own records, the number is what
      // they can check.
      ...(isCompany
        ? [
            {
              label: t.companyNameLabel,
              value: registration.companyName ?? '',
            },
            {
              label: t.companyIdLabel,
              value: registration.companyRegistrationId ?? '',
            },
          ]
        : []),
    ],
    action: { label: t.action, path: '/admin/users' },
  };
}
