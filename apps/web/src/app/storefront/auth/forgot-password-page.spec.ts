import { COMMON_TEXT } from '../../shared/config/common-text';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../../shared/config/app-text';
import { defaultAppText } from '../../shared/config/app-text.fixture';
import { defaultCommonText } from '../../shared/config/common-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { AuthService } from '../../shared/auth/auth.service';
import { ForgotPasswordPage } from './forgot-password-page';

const text = defaultAppText.auth.forgotPassword;

async function render(outcome: 'ok' | 'error' = 'ok') {
  const forgotPassword = vi.fn(async () => outcome);

  TestBed.configureTestingModule({
    imports: [ForgotPasswordPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: COMMON_TEXT, useValue: defaultCommonText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AuthService, useValue: { forgotPassword } },
    ],
  });

  const fixture = TestBed.createComponent(ForgotPasswordPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    el,
    forgotPassword,
    type: (value: string) => {
      const input = el.querySelector<HTMLInputElement>('#email');
      if (!input) throw new Error('no email field');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    submit: async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('ForgotPasswordPage', () => {
  it('sends the address and confirms without promising an account exists', async () => {
    const { type, submit, forgotPassword, el } = await render();

    type('alex@example.com');
    await submit();

    expect(forgotPassword).toHaveBeenCalledWith('alex@example.com');
    expect(el.textContent).toContain(text.successHeading);
    // The form is gone, so the address cannot be resubmitted by reflex.
    expect(el.querySelector('form')).toBeNull();
  });

  it('refuses to send an address that is not one', async () => {
    const { type, submit, forgotPassword, el } = await render();

    type('not-an-address');
    await submit();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(defaultCommonText.fields.email.invalid);
  });

  it('asks for an address before submitting at all', async () => {
    const { submit, forgotPassword, el } = await render();

    await submit();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(defaultCommonText.fields.email.required);
  });

  // A failed request is the only thing worth reporting: the server's answer is
  // uniform, so there is no "no such account" state to render.
  it('reports a request that did not go through', async () => {
    const { type, submit, el } = await render('error');

    type('alex@example.com');
    await submit();

    expect(el.textContent).toContain(text.error);
    expect(el.textContent).not.toContain(text.successHeading);
  });
});
