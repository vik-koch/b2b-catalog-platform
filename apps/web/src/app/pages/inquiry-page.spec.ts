import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { InquiryPage } from './inquiry-page';
import { InquiryService } from './inquiry.service';

const text = defaultAppText.inquiry;

const testConfig: DeploymentConfig = {
  branding: { name: 'Test', logo: '/logo.svg', title: 'Test' },
  cookieConsentEnabled: false,
  locations: [],
  phoneInput: { countryCode: '+49', mask: '(###) ###-####' },
};

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  );
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function selectPreferred(root: HTMLElement, value: 'email' | 'phone'): void {
  const radio = root.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${value}"]`,
  );
  if (!radio) throw new Error(`no radio for ${value}`);
  radio.click();
}

function acceptPrivacy(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
}

function submitForm(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
}

async function render() {
  const submit = vi.fn<InquiryService['submit']>().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [InquiryPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: testConfig },
      { provide: InquiryService, useValue: { submit } },
    ],
  });

  const fixture = TestBed.createComponent(InquiryPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  // Flush a macrotask so a submit()'s awaited (and un-held) promise settles
  // before we re-render and assert, then run change detection.
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, submit, sync };
}

describe('InquiryPage', () => {
  it('blocks submit and shows an error when the name is missing', async () => {
    const { el, submit, sync } = await render();

    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.nameRequired);
  });

  it('requires email when "by email" is chosen (the default)', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.emailRequired);
    expect(el.textContent).not.toContain(text.validation.phoneRequired);
  });

  it('switches the required field to phone when "by phone" is chosen', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    selectPreferred(el, 'phone');
    await sync();
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.phoneRequired);
    expect(el.textContent).not.toContain(text.validation.emailRequired);
  });

  it('blocks submit until the privacy policy is accepted', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.privacyRequired);
  });

  it('rejects an address the server would reject (shared Zod email rule)', async () => {
    const { el, submit, sync } = await render();

    // Passes Angular's built-in Validators.email but fails the contract's
    // emailSchema (no TLD) — the drift the shared validator closes.
    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example');
    acceptPrivacy(el);
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.emailInvalid);
  });

  it('submits a valid inquiry and shows the success message', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    setInput(el, '#message', 'Do you deliver to Altona?');
    acceptPrivacy(el);
    submitForm(el);
    await sync();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: undefined,
      preferredContact: 'email',
      message: 'Do you deliver to Altona?',
    });
    expect(el.textContent).toContain(text.success);
  });

  it('masks the phone and submits it with the configured country code', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    selectPreferred(el, 'phone');
    await sync();
    setInput(el, '#phone', '0301234567');
    acceptPrivacy(el);

    const phoneInput = el.querySelector<HTMLInputElement>('#phone');
    expect(phoneInput?.value).toBe('(030) 123-4567');

    submitForm(el);
    await sync();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: undefined,
      phone: '+49 (030) 123-4567',
      preferredContact: 'phone',
      message: undefined,
    });
  });

  it('hides the honeypot but forwards a filled value for server-side rejection', async () => {
    const { el, submit, sync } = await render();

    // Present, but kept from real users: inside an aria-hidden wrapper and out
    // of the tab order.
    const honeypot = el.querySelector<HTMLInputElement>('#website');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(honeypot?.tabIndex).toBe(-1);

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    setInput(el, '#website', 'http://spam.example');
    acceptPrivacy(el);
    submitForm(el);
    await sync();

    // The client doesn't judge the honeypot; it hands the value to the server,
    // which silently drops it.
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'http://spam.example' }),
    );
  });

  it('shows the error message when submission fails', async () => {
    const { el, submit, sync } = await render();
    submit.mockRejectedValue(new Error('boom'));

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    acceptPrivacy(el);
    submitForm(el);
    await sync();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(text.error);
  });
});
