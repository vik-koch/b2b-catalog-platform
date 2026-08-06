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
  const mail = newRegistrationMail('jane@example.com', demoMailText);

  it('carries the address staff have to act on', () => {
    expect(mail.rows).toEqual([
      {
        label: demoMailText.newRegistration.emailLabel,
        value: 'jane@example.com',
      },
    ]);
  });

  it('links into the account list, as a path the layout resolves', () => {
    expect(mail.action).toEqual({
      label: demoMailText.newRegistration.action,
      path: '/admin/users',
    });
  });
});
