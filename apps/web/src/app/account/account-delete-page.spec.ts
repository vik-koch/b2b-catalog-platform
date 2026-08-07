import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from '../auth/auth.service';
import { AccountDeletePage } from './account-delete-page';
import { AccountService, DeleteAccountResult } from './account.service';

const text = defaultAppText.auth.myAccount.delete;

async function render(outcome: DeleteAccountResult | 'throw') {
  const deleteAccount = vi.fn(async () => {
    if (outcome === 'throw') throw new Error('boom');
    return outcome;
  });
  const logout = vi.fn(async () => undefined);

  TestBed.configureTestingModule({
    imports: [AccountDeletePage],
    providers: [
      provideRouter([{ path: '', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AuthService, useValue: { logout } },
      { provide: AccountService, useValue: { deleteAccount } },
    ],
  });

  const fixture = TestBed.createComponent(AccountDeletePage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    el,
    deleteAccount,
    logout,
    type: (value: string) => {
      const input = el.querySelector<HTMLInputElement>('#password');
      if (!input) throw new Error('no password field');
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

describe('AccountDeletePage', () => {
  // Somebody who would mind losing their order history has to find that out
  // here, not afterwards.
  it('spells out what deletion does before asking for anything', async () => {
    const { el } = await render('ok');

    expect(el.textContent).toContain(text.intro);
    for (const line of text.consequences) {
      expect(el.textContent).toContain(line);
    }
  });

  it('will not submit without the password', async () => {
    const { submit, deleteAccount, el } = await render('ok');

    await submit();

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.currentPasswordRequired,
    );
  });

  it('deletes, drops the local session, and says so', async () => {
    const { type, submit, deleteAccount, logout, el } = await render('ok');

    type('my-password');
    await submit();

    expect(deleteAccount).toHaveBeenCalledWith('my-password');
    // The chrome must stop claiming a signed-in user; the cookie is already
    // gone server-side.
    expect(logout).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(text.doneHeading);
    // And there is nothing left to submit.
    expect(el.querySelector('form')).toBeNull();
  });

  it('reports a mistyped password without deleting anything', async () => {
    const { type, submit, logout, el } = await render('wrong-password');

    type('not-my-password');
    await submit();

    expect(el.textContent).toContain(text.wrongPassword);
    expect(logout).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain(text.doneHeading);
  });

  // A real answer rather than a fault: it needs its own words.
  it('explains the last-admin refusal', async () => {
    const { type, submit, el } = await render('last-admin');

    type('my-password');
    await submit();

    expect(el.textContent).toContain(text.lastAdmin);
  });

  it('reports an unexpected failure', async () => {
    const { type, submit, el } = await render('throw');

    type('my-password');
    await submit();

    expect(el.textContent).toContain(text.error);
  });
});
