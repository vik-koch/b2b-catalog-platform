import { TestBed } from '@angular/core/testing';
import { PASSWORD_MIN_LENGTH } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService, ChangePasswordResult } from './auth.service';
import { ChangePasswordForm } from './change-password-form';

const text = defaultAppText.auth.changePassword;
const validation = defaultAppText.auth.validation;

const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);
const longEnough = 'x'.repeat(PASSWORD_MIN_LENGTH);

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
}

function fill(
  root: HTMLElement,
  fields: { current?: string; next?: string; confirm?: string },
): void {
  const { current = 'old-secret', next = longEnough, confirm = next } = fields;
  setInput(root, '#change-password-current', current);
  setInput(root, '#change-password-new', next);
  setInput(root, '#change-password-confirm', confirm);
}

async function render(result: ChangePasswordResult = { result: 'ok' }) {
  const changePassword = vi
    .fn<AuthService['changePassword']>()
    .mockResolvedValue(result);

  TestBed.configureTestingModule({
    imports: [ChangePasswordForm],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { changePassword } },
    ],
  });

  const fixture = TestBed.createComponent(ChangePasswordForm);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const submit = () =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  // Flush a macrotask so submit()'s awaited promise settles before asserting.
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  return { fixture, el, changePassword, changed, submit, sync };
}

describe('ChangePasswordForm', () => {
  it('blocks submit and reports every missing field', async () => {
    const { el, changePassword, submit, sync } = await render();

    submit();
    await sync();

    expect(changePassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(validation.currentPasswordRequired);
    expect(el.textContent).toContain(validation.newPasswordRequired);
  });

  it('rejects a password the server would reject (shared Zod length rule)', async () => {
    const { el, changePassword, submit, sync } = await render();

    fill(el, { next: tooShort });
    submit();
    await sync();

    expect(changePassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      validation.newPasswordTooShort.replace(
        '{min}',
        String(PASSWORD_MIN_LENGTH),
      ),
    );
  });

  it('refuses to submit when the confirmation does not match', async () => {
    const { el, changePassword, submit, sync } = await render();

    fill(el, { next: longEnough, confirm: `${longEnough}-typo` });
    submit();
    await sync();

    expect(changePassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(validation.confirmPasswordMismatch);
  });

  it('sends only the two passwords the contract asks for', async () => {
    const { el, changePassword, submit, sync } = await render();

    fill(el, { current: 'old-secret', next: longEnough });
    submit();
    await sync();

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-secret',
      newPassword: longEnough,
    });
  });

  it('confirms success, clears the fields and announces the change', async () => {
    const { el, changed, submit, sync } = await render({ result: 'ok' });

    fill(el, {});
    submit();
    await sync();

    expect(el.textContent).toContain(text.success);
    expect(changed).toHaveBeenCalled();
    const current = el.querySelector<HTMLInputElement>(
      '#change-password-current',
    );
    expect(current?.value).toBe('');
  });

  it('reports a wrong current password as a correctable mistake', async () => {
    const { el, changed, submit, sync } = await render({
      result: 'wrong-current',
    });

    fill(el, { current: 'not-my-password' });
    submit();
    await sync();

    expect(el.textContent).toContain(text.wrongCurrent);
    expect(el.textContent).not.toContain(text.success);
    expect(changed).not.toHaveBeenCalled();
  });

  it('distinguishes a failure that is not the current password', async () => {
    const { el, changed, submit, sync } = await render({ result: 'error' });

    fill(el, {});
    submit();
    await sync();

    expect(el.textContent).toContain(text.error);
    expect(el.textContent).not.toContain(text.wrongCurrent);
    expect(changed).not.toHaveBeenCalled();
  });

  it('namespaces its element ids so two copies can share a document', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('idPrefix', 'forced');
    await fixture.whenStable();

    expect(el.querySelector('#forced-current')).not.toBeNull();
    expect(
      el.querySelector<HTMLLabelElement>('label[for="forced-current"]'),
    ).not.toBeNull();
  });

  // The form stays on screen for reuse after a success, so the fields it just
  // emptied must not accuse the user of leaving them blank.
  it('shows no errors beside its own success message', async () => {
    const { el, sync, submit } = await render();

    fill(el, {});
    submit();
    await sync();

    expect(el.textContent).toContain(text.success);
    expect(el.textContent).not.toContain(validation.currentPasswordRequired);
    expect(el.textContent).not.toContain(validation.newPasswordRequired);
  });

  // Two different 400s. Showing "that is not your current password" because
  // the *new* one was refused is exactly the confusion this distinction is
  // for — it sends the user to correct a field that was never wrong.
  it('shows the policy’s reason when the new password is refused', async () => {
    const { el, sync, submit } = await render({
      result: 'rejected',
      message: 'Please choose a password different from your current one.',
    });

    fill(el, {});
    submit();
    await sync();

    expect(el.textContent).toContain(
      'Please choose a password different from your current one.',
    );
    expect(el.textContent).not.toContain(text.wrongCurrent);
  });

  it('still says so when the current password is what was wrong', async () => {
    const { el, sync, submit } = await render({ result: 'wrong-current' });

    fill(el, {});
    submit();
    await sync();

    expect(el.textContent).toContain(text.wrongCurrent);
  });
});
