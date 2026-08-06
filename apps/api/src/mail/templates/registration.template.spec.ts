import { demoMailText } from '../mail-text.fixture';
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
  const mail = newRegistrationMail(person, demoMailText);

  // This mail is what a manager reads before deciding whether the applicant is
  // a customer they already know, so it repeats everything submitted.
  it('carries every detail staff have to act on', () => {
    expect(mail.rows).toEqual([
      { label: t.nameLabel, value: 'Jane Doe' },
      { label: t.emailLabel, value: 'jane@example.com' },
      { label: t.phoneLabel, value: '+49 40 1234567' },
      { label: t.customerTypeLabel, value: t.customerTypePerson },
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
    );

    expect(company.rows).toContainEqual({
      label: t.companyIdLabel,
      value: '123456789',
    });
    expect(company.rows).toContainEqual({
      label: t.customerTypeLabel,
      value: t.customerTypeCompany,
    });
    // A private person gets no empty row where the number would be.
    expect(mail.rows?.map((r) => r.label)).not.toContain(t.companyIdLabel);
  });

  it('links into the account list, as a path the layout resolves', () => {
    expect(mail.action).toEqual({
      label: demoMailText.newRegistration.action,
      path: '/admin/users',
    });
  });
});
