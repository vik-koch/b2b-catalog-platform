import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SignInStep } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from './auth.service';
import { SignInStepPanel } from './sign-in-step';

const text = defaultAppText.auth.signInStep;

const codeStep: SignInStep = {
  step: 'code',
  sentTo: '+49 (•••) •••-••78',
  phone: '+49 (•••) •••-••78',
  confirming: false,
  rememberDays: 0,
  resendIn: 0,
};

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

async function render(initial: SignInStep) {
  const step = signal<SignInStep | null>(initial);
  const auth = {
    step,
    submitCode: vi.fn<AuthService['submitCode']>(),
    resendCode: vi.fn<AuthService['resendCode']>(),
    retryAfter: signal<number | null>(null),
  };

  TestBed.configureTestingModule({
    imports: [SignInStepPanel],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AuthService, useValue: auth },
    ],
  });

  const fixture = TestBed.createComponent(SignInStepPanel);
  const done = vi.fn();
  fixture.componentInstance.done.subscribe(done);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { el, auth, step, done, sync };
}

describe('SignInStepPanel', () => {
  it('names where the code went, kept on one line', async () => {
    const { el } = await render({ ...codeStep, sentTo: 'j•••@example.com' });

    const where = el.querySelector('p span.whitespace-nowrap');
    expect(where?.textContent).toBe('j•••@example.com');
  });

  it('counts down to the next code on the resend control', async () => {
    const { el } = await render({ ...codeStep, resendIn: 42 });

    const resend = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(text.resendIn.replace('{time}', '0:42')),
    );
    expect(resend?.disabled).toBe(true);
  });

  it('checks the code’s shape before asking the server', async () => {
    const { el, auth, sync } = await render(codeStep);

    setInput(el, '#signInCode', '12345');
    button(el, text.submit).click();
    await sync();

    expect(auth.submitCode).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.codeFormat.replace('{length}', '6'));
  });

  it('says so when the code is wrong, and stays', async () => {
    const { el, auth, done, sync } = await render(codeStep);
    auth.submitCode.mockResolvedValue({ result: 'wrong', attemptsLeft: 2 });

    // Six digits submit by themselves.
    setInput(el, '#signInCode', '123456');
    await sync();

    expect(auth.submitCode).toHaveBeenCalledWith('123456', false);
    expect(el.textContent).toContain(text.wrong.replace('{count}', '2'));
    expect(done).not.toHaveBeenCalled();
  });

  it('reports the session once the code is right', async () => {
    const { el, auth, done, sync } = await render(codeStep);
    auth.submitCode.mockResolvedValue({ result: 'ok' });

    // Six digits submit by themselves.
    setInput(el, '#signInCode', '123456');
    await sync();

    expect(done).toHaveBeenCalled();
  });

  it('says the code is spent after the last wrong try', async () => {
    const { el, auth, sync } = await render(codeStep);
    auth.submitCode.mockResolvedValue({ result: 'wrong', attemptsLeft: 0 });

    setInput(el, '#signInCode', '123456');
    await sync();

    expect(el.textContent).toContain(text.expired);
  });

  // The message stays while the next request is out, so nothing jumps.
  it('keeps the last message until the next answer replaces it', async () => {
    const { el, auth, sync } = await render(codeStep);
    auth.submitCode.mockResolvedValueOnce({ result: 'wrong', attemptsLeft: 2 });
    setInput(el, '#signInCode', '123456');
    await sync();

    let answer: (value: {
      result: 'wrong';
      attemptsLeft: number;
    }) => void = () => undefined;
    auth.submitCode.mockReturnValueOnce(
      new Promise((resolve) => (answer = resolve)),
    );
    setInput(el, '#signInCode', '654321');
    await sync();
    expect(el.textContent).toContain(text.wrong.replace('{count}', '2'));

    answer({ result: 'wrong', attemptsLeft: 1 });
    await sync();
    expect(el.textContent).toContain(text.wrong.replace('{count}', '1'));
  });

  it('sends the visitor back to the password when the sign-in ran out', async () => {
    const { el, auth, sync } = await render(codeStep);
    auth.submitCode.mockResolvedValue({ result: 'restart' });

    // Six digits submit by themselves.
    setInput(el, '#signInCode', '123456');
    await sync();

    expect(el.textContent).toContain(text.restart);
    expect(el.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('tells a resend that went out from one that did not', async () => {
    const { el, auth, sync } = await render(codeStep);
    auth.resendCode.mockResolvedValueOnce('ok');

    button(el, text.resend).click();
    await sync();
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      text.resent,
    );

    // Another browser asked first: the server names the wait, and the
    // countdown takes it over.
    auth.resendCode.mockImplementationOnce(async () => {
      auth.retryAfter.set(90);
      return 'limit';
    });
    button(el, text.resend).click();
    await sync();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.limit.replace('{time}', '1:30'),
    );
    expect(el.textContent).toContain(text.resendIn.replace('{time}', '1:30'));
  });

  it('says the code also confirms the number, while it does', async () => {
    const { el } = await render({ ...codeStep, confirming: true });

    expect(el.textContent).toContain(
      text.confirmNote.replace('{phone}', codeStep.phone),
    );
  });

  // The number is staff's to set: nothing here offers another.
  it('offers no way to name another number', async () => {
    const { el } = await render({ ...codeStep, confirming: true });

    expect(el.querySelector('#phone')).toBeNull();
    expect(el.querySelectorAll('button')).toHaveLength(2);
  });

  it('offers no box where the deployment remembers no browser', async () => {
    const { el } = await render(codeStep);

    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('remembers the browser where the box is ticked', async () => {
    const { el, auth, sync } = await render({ ...codeStep, rememberDays: 30 });
    auth.submitCode.mockResolvedValue({ result: 'wrong', attemptsLeft: 2 });

    expect(el.textContent).toContain(text.remember.replace('{days}', '30'));
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    setInput(el, '#signInCode', '123456');
    await sync();

    expect(auth.submitCode).toHaveBeenCalledWith('123456', true);
    // A wrong code empties the boxes, not the choice.
    expect(
      el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(true);
  });
});
