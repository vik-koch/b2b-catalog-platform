import { demoCommonText, demoMailText } from '../mail-text.fixture';
import { newRegistrationMail } from './new-registration.template';
import { registrationReceivedMail } from './registration-received.template';

describe('registrationReceivedMail', () => {
  const mail = registrationReceivedMail(demoMailText);

  it('uses the configured wording', () => {
    expect(mail.subject).toBe(demoMailText.registrationReceived.subject);
    expect(mail.heading).toBe(demoMailText.registrationReceived.heading);
    expect(mail.paragraphs).toEqual([
      demoMailText.registrationReceived.body,
      demoMailText.registrationReceived.nextSteps,
    ]);
  });

  // Nothing is actionable yet: the account cannot sign in until it is approved,
  // so a link back into the app would only lead to a login it must fail.
  it('offers no action and reveals nothing about the account', () => {
    expect(mail.action).toBeUndefined();
    expect(mail.rows).toBeUndefined();
  });
});

describe('newRegistrationMail', () => {
  const person = {
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+49 40 1234567',
    customerType: 'person',
  } as const;
  const t = demoMailText.newRegistration;
  const fields = demoCommonText.fields;
  const kinds = demoCommonText.partyKind;
  const mail = newRegistrationMail(person, demoMailText, demoCommonText);

  // This mail is what a manager reads before deciding whether the applicant is
  // a customer they already know, so it repeats everything submitted.
  it('carries every detail staff have to act on', () => {
    expect(mail.rows).toEqual([
      // Family name first, as every staff-facing list of people reads.
      { label: fields.name.label, value: 'Doe Jane' },
      { label: fields.email.label, value: 'jane@example.com' },
      { label: fields.phone.label, value: '+49 40 1234567' },
      { label: t.customerTypeLabel, value: kinds.person },
    ]);
  });

  it('adds the registration number only for a company', () => {
    const company = newRegistrationMail(
      {
        ...person,
        customerType: 'company',
        companyRegistrationId: '123456789',
      },
      demoMailText,
      demoCommonText,
    );

    expect(company.rows).toContainEqual({
      label: fields.companyId.label,
      value: '123456789',
    });
    expect(company.rows).toContainEqual({
      label: t.customerTypeLabel,
      value: kinds.company,
    });
    // A private person gets no empty row where the number would be.
    expect(mail.rows?.map((r) => r.label)).not.toContain(
      fields.companyId.label,
    );
  });

  it('links into the account list, as a path the layout resolves', () => {
    expect(mail.action).toEqual({
      label: demoMailText.newRegistration.action,
      path: '/admin/users',
    });
  });
});
