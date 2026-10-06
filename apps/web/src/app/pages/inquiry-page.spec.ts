import { TestBed } from '@angular/core/testing';
import { Page } from '@b2b-catalog-platform/shared';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { InquiryPage } from './inquiry-page';
import { InquiryService } from './inquiry.service';
import { PageService } from './page.service';

const text = defaultAppText.inquiry;
const consentText = defaultAppText.consentBox;

const testConfig: DeploymentConfig = { ...defaultDeploymentConfig };

const consentPage: Page = {
  version: 3,
  title: 'Consent: contact form',
  bodyHtml: '<p>Text.</p>',
  consentLabel: 'I [consent] to the processing of my inquiry.',
  updatedAt: '2026-10-05T10:00:00.000Z',
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

function tickConsent(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
}

function submitForm(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
}

async function render(
  options: { config?: DeploymentConfig; page?: Page | null } = {},
) {
  const submit = vi.fn<InquiryService['submit']>().mockResolvedValue(undefined);
  const getPage = vi
    .fn<PageService['getPage']>()
    .mockResolvedValue(options.page === undefined ? consentPage : options.page);

  TestBed.configureTestingModule({
    imports: [InquiryPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: options.config ?? testConfig },
      { provide: InquiryService, useValue: { submit } },
      { provide: PageService, useValue: { getPage } },
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
  return { fixture, el, submit, getPage, sync };
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

  it('blocks submit until the consent box is ticked', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(consentText.required);
  });

  it('rejects an address the server would reject (shared Zod email rule)', async () => {
    const { el, submit, sync } = await render();

    // Passes Angular's built-in Validators.email but fails the contract's
    // emailSchema (no TLD) — the drift the shared validator closes.
    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example');
    tickConsent(el);
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
    tickConsent(el);
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

  // A number typed into the field that is not the chosen channel is still a
  // number the shop will dial, so half of one is refused there too.
  it('refuses a half-typed phone even when email is the chosen channel', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    setInput(el, '#email', 'jane@example.com');
    setInput(el, '#phone', '4012');
    tickConsent(el);
    submitForm(el);
    await sync();

    expect(submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.phoneIncomplete);
  });

  it('masks the phone and submits it with the configured country code', async () => {
    const { el, submit, sync } = await render();

    setInput(el, '#name', 'Jane Doe');
    selectPreferred(el, 'phone');
    await sync();
    setInput(el, '#phone', '0301234567');
    tickConsent(el);

    const phoneInput = el.querySelector<HTMLInputElement>('#phone');
    expect(phoneInput?.value).toBe('(030) 123-4567');

    submitForm(el);
    await sync();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: undefined,
      phone: '+490301234567',
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
    tickConsent(el);
    submitForm(el);
    await sync();

    // The client doesn't judge the honeypot; it hands the value to the server,
    // which silently drops it.
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'http://spam.example' }),
    );
  });

  describe('the consent box (NFR-LEGAL-09)', () => {
    const fill = (el: HTMLElement) => {
      setInput(el, '#name', 'Jane Doe');
      setInput(el, '#email', 'jane@example.com');
    };

    it('is worded by the consent text, its bracketed words the link', async () => {
      const { el, getPage } = await render();

      expect(getPage).toHaveBeenCalledWith('consent-contact');
      const label = el.querySelector('label[for^="consent-"]');
      expect(label?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'I consent to the processing of my inquiry.*',
      );
      const link = label?.querySelector<HTMLAnchorElement>(
        'a[href="/consent-contact"]',
      );
      expect(link?.textContent?.trim()).toBe('consent');
      expect(link?.target).toBe('_blank');
    });

    // Published but never written: nothing to show, so nothing is sent.
    it('refuses to send while the published text has no version', async () => {
      const { el, submit, sync } = await render({ page: null });

      fill(el);
      submitForm(el);
      await sync();

      expect(el.textContent).toContain(consentText.unavailable);
      expect(submit).not.toHaveBeenCalled();
    });
  });
});
