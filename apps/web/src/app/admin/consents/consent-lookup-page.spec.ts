import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ConsentRecord } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConsentLookupPage } from './consent-lookup-page';
import { ConsentsService } from './consents.service';

const text = defaultAdminText.consents;

function record(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'c1',
    purpose: 'contact',
    givenAt: '2026-10-05T09:30:00.000Z',
    version: 3,
    label: 'I [consent] to the processing of my inquiry.',
    email: 'ida@example.com',
    phone: '+490301234567',
    account: null,
    withdrawal: null,
    ...overrides,
  };
}

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function render(
  options: {
    query?: { email?: string; phone?: string };
    records?: ConsentRecord[];
  } = {},
) {
  const service = { find: vi.fn(async () => options.records ?? []) };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ConsentLookupPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: ConsentsService, useValue: service },
    ],
  });

  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(ConsentLookupPage);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    fixture.componentRef.setInput(key, value);
  }
  const sync = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await sync();

  const el = fixture.nativeElement as HTMLElement;
  const submit = async () => {
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await sync();
  };
  return { el, service, navigate, sync, submit };
}

describe('ConsentLookupPage', () => {
  it('asks for nothing until a search is in the address bar', async () => {
    const { service } = await render();

    expect(service.find).not.toHaveBeenCalled();
  });

  it('puts a typed address into the address bar, as the API compares it', async () => {
    const { el, navigate, submit } = await render();

    setInput(el, '#email', ' Ida@Example.com ');
    await submit();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { email: 'ida@example.com' },
    });
  });

  it('puts a typed number in as the forms store it', async () => {
    const { el, navigate, sync, submit } = await render();

    el.querySelector<HTMLInputElement>(
      'input[type="radio"][value="phone"]',
    )?.click();
    await sync();
    setInput(el, '#phone', '0301234567');
    await submit();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { phone: '+490301234567' },
    });
  });

  it('searches for nothing when the box is empty', async () => {
    const { navigate, submit } = await render();

    await submit();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('lists what the address bar asks for, with the wording that was ticked', async () => {
    const { el, service } = await render({
      query: { email: 'ida@example.com' },
      records: [record()],
    });

    expect(service.find).toHaveBeenCalledWith({ email: 'ida@example.com' });
    expect(el.textContent).toContain(text.purposes.contact);
    // The link marks are taken off: it reads as the box read.
    expect(el.textContent).toContain(
      'I consent to the processing of my inquiry.',
    );
    expect(el.textContent).toContain('Version 3');
    // The search fills the form it would have been typed into.
    expect(el.querySelector<HTMLInputElement>('#email')?.value).toBe(
      'ida@example.com',
    );
  });

  it('leads to the account a record was given for', async () => {
    const { el } = await render({
      query: { email: 'rita@example.com' },
      records: [
        record({
          purpose: 'account',
          email: 'rita@example.com',
          account: { id: 'u7', name: 'Registrant Rita', status: 'active' },
        }),
      ],
    });

    const link = el.querySelector<HTMLAnchorElement>(
      'a[href="/admin/users/u7"]',
    );
    expect(link?.textContent?.trim()).toBe('Registrant Rita');
  });

  it("says when an account record's account is gone", async () => {
    const { el } = await render({
      query: { email: 'rita@example.com' },
      records: [record({ purpose: 'account', email: 'rita@example.com' })],
    });

    expect(el.textContent).toContain(text.accountGone);
  });

  it('says plainly that nothing was found, and for what', async () => {
    const { el } = await render({ query: { phone: '+490301234567' } });

    expect(el.textContent).toContain(
      text.empty.replace('{query}', '+49 (030) 123-4567'),
    );
    expect(el.querySelector<HTMLInputElement>('#phone')?.value).toBe(
      '(030) 123-4567',
    );
  });
});
