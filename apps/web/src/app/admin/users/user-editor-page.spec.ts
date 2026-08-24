import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  Router,
  provideRouter,
} from '@angular/router';
import { CustomerTier, StaffUser } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { AuthService } from '../../auth/auth.service';
import { TiersService } from '../tiers/tiers.service';
import { UserEditorPage } from './user-editor-page';
import { StaffUsersService } from './users.service';

const text = defaultAdminText.userEditor;

/** The demo deployment's own rules, which the form is built from. */
const phone = defaultDeploymentConfig.phoneInput;

function user(overrides: Partial<StaffUser> = {}): StaffUser {
  return {
    id: 'u1',
    email: 'jane@example.com',
    role: 'user',
    status: 'active',
    firstName: 'Jane',
    lastName: 'Doe',
    // Stored the way the registration form composes it: country code, then
    // the masked national part.
    phone: '+490401234567',
    customerType: 'person',
    companyName: null,
    companyRegistrationId: null,
    tierId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    approvedAt: '2026-08-02T00:00:00.000Z',
    approvedBy: 'admin-1',
    ...overrides,
  };
}

const wholesale: CustomerTier = {
  id: 'tier-w',
  key: 'wholesale',
  label: 'Wholesale',
  userCount: 2,
  priceCount: 1,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function render(
  options: {
    /** Absent = one of the two "new" routes. */
    account?: StaffUser | null;
    kind?: 'customer' | 'staff';
    role?: 'admin' | 'manager';
    tiers?: CustomerTier[];
  } = {},
) {
  const isNew = options.account === undefined;
  const service = {
    get: vi.fn(async () => options.account ?? undefined),
    update: vi.fn<StaffUsersService['update']>(async () => ({
      ok: true,
      user: user(),
    })),
    create: vi.fn<StaffUsersService['create']>(async () => ({
      ok: true,
      user: user(),
    })),
    approve: vi.fn<StaffUsersService['approve']>(async () => ({
      ok: true,
      user: user({ status: 'invited' }),
    })),
    resendInvitation: vi.fn<StaffUsersService['resendInvitation']>(
      async () => ({
        ok: true,
      }),
    ),
  };
  const tiers = {
    list: vi.fn(async () => ({
      tiers: options.tiers ?? [wholesale],
      defaultUserCount: 0,
    })),
  };
  const navigateByUrl = vi.fn().mockResolvedValue(true);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserEditorPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: AuthService,
        useValue: { user: () => ({ role: options.role ?? 'admin' }) },
      },
      { provide: StaffUsersService, useValue: service },
      { provide: TiersService, useValue: tiers },
      { provide: Router, useValue: { navigateByUrl, url: '/admin/users' } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(isNew ? {} : { id: 'u1' }),
            queryParamMap: convertToParamMap({}),
            data: { kind: options.kind ?? 'customer' },
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(UserEditorPage);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const field = (id: string) =>
    el.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null;
  const type = async (id: string, value: string) => {
    const input = field(id);
    if (!input) throw new Error(`no field #${id}`);
    input.value = value;
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input'),
    );
    await settle();
  };
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;
  const press = async (label: string) => {
    const target = button(label);
    if (!target) throw new Error(`no button "${label}"`);
    target.click();
    await settle();
  };

  return {
    el,
    service,
    tiers,
    navigateByUrl,
    fixture,
    field,
    type,
    button,
    press,
  };
}

describe('UserEditorPage', () => {
  it('seeds the form from a stored account, minus the parts the field does not own', async () => {
    const { field } = await render({
      account: user({
        customerType: 'company',
        companyRegistrationId: 'DE123456789',
      }),
    });

    expect((field('firstName') as HTMLInputElement).value).toBe('Jane');
    // The country code is displayed beside the phone field, never inside it —
    // otherwise a save would double it up. A registration number has no such
    // split: it is shown exactly as stored, whatever shape it is in.
    expect((field('phone') as HTMLInputElement).value).toBe('(040) 123-4567');
    expect((field('companyRegistrationId') as HTMLInputElement).value).toBe(
      'DE123456789',
    );
    expect(phone?.countryCode).toBe('+49');
  });

  it('saves them back in the canonical form the API stores', async () => {
    const { service, type, press } = await render({
      account: user({
        customerType: 'company',
        companyName: 'Kontor GmbH',
        companyRegistrationId: 'DE123456789',
        tierId: 'tier-w',
      }),
    });

    await type('lastName', 'Doe-Smith');
    await press(defaultAdminText.common.save);

    expect(service.update).toHaveBeenCalledWith('u1', {
      firstName: 'Jane',
      lastName: 'Doe-Smith',
      phone: '+490401234567',
      customerType: 'company',
      companyName: 'Kontor GmbH',
      companyRegistrationId: 'DE123456789',
      tierId: 'tier-w',
      role: undefined,
    });
  });

  it('never offers the email address as a field on an existing account', async () => {
    const { el, field } = await render({ account: user() });

    expect(field('email')).toBeNull();
    expect(el.textContent).toContain(text.emailFixed);
    // It is still shown — it is how staff recognise the account.
    expect(el.textContent).toContain('jane@example.com');
  });

  it('asks a pending registration for a tier before approving it', async () => {
    const { el, service, press } = await render({
      account: user({ status: 'pending', tierId: null }),
    });

    expect(el.querySelector('h1')?.textContent).toContain(text.approveTitle);
    await press(text.approve);

    // No tier is a default anywhere, so approval has nothing to fall back on.
    expect(service.approve).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.tierRequired);
  });

  it('writes corrections before it approves, so the typo is not what gets approved', async () => {
    const { service, type, press } = await render({
      account: user({ status: 'pending', tierId: null }),
    });

    await type('lastName', 'Doh');
    await type('tier', 'tier-w');
    await press(text.approve);

    expect(service.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ lastName: 'Doh' }),
    );
    expect(service.approve).toHaveBeenCalledWith('u1', 'tier-w');
  });

  it('lets a pending registration be corrected without being approved', async () => {
    const { service, type, press } = await render({
      account: user({ status: 'pending', tierId: null }),
    });

    await type('lastName', 'Doh');
    await press(defaultAdminText.common.save);

    expect(service.update).toHaveBeenCalled();
    expect(service.approve).not.toHaveBeenCalled();
  });

  it('keeps the role field to admins, and off a manager’s request entirely', async () => {
    const asManager = await render({
      account: user({ role: 'manager', customerType: null }),
      role: 'manager',
    });
    expect(asManager.field('role')).toBeNull();

    await asManager.press(defaultAdminText.common.save);
    // Absent, not `undefined`-and-refused: the API rejects the field outright,
    // and a manager's ordinary save must not trip that.
    expect(asManager.service.update.mock.calls[0][1]).not.toHaveProperty(
      'role',
    );

    const asAdmin = await render({
      account: user({ role: 'manager', customerType: null }),
      role: 'admin',
    });
    expect(asAdmin.field('role')).not.toBeNull();
  });

  it('creates a customer as a customer, whatever the role field would say', async () => {
    const { service, type, press } = await render({ kind: 'customer' });

    await type('email', 'new@example.com');
    await type('firstName', 'Neu');
    await type('lastName', 'Kunde');
    await press(text.create);

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        role: 'user',
        firstName: 'Neu',
        lastName: 'Kunde',
      }),
    );
  });

  it('creates a staff account with the chosen role and no tier', async () => {
    const { service, type, press } = await render({ kind: 'staff' });

    await type('email', 'colleague@example.com');
    await type('firstName', 'Kim');
    await type('lastName', 'Chef');
    await type('role', 'admin');
    await press(text.create);

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', tierId: null }),
    );
  });

  it('refuses to create without the fields an account cannot exist without', async () => {
    const { service, press, el } = await render({ kind: 'customer' });

    await press(text.create);

    expect(service.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.emailRequired);
  });

  it('shows a closed account as a record, with nothing to save', async () => {
    const { el, button } = await render({
      account: user({ status: 'anonymized' }),
    });

    expect(el.textContent).toContain(text.closed);
    expect(button(defaultAdminText.common.save)).toBeUndefined();
  });

  it('re-sends the invitation only while there is one to re-send', async () => {
    const invited = await render({ account: user({ status: 'invited' }) });
    await invited.press(text.resend);

    expect(invited.service.resendInvitation).toHaveBeenCalledWith('u1');
    expect(invited.el.textContent).toContain(text.resendSent);

    // Once a password has been chosen the way back in is a reset, and the
    // invitation wording ("choose a password") would no longer be true.
    const active = await render({ account: user({ status: 'active' }) });
    expect(active.button(text.resend)).toBeUndefined();
  });

  it('shows where the account stands, in the list\u2019s own words', async () => {
    const { el } = await render({ account: user({ status: 'disabled' }) });

    expect(el.textContent).toContain(defaultAdminText.userList.statusDisabled);
  });

  it('says so when the account is not there (or not the caller’s to see)', async () => {
    const { el } = await render({ account: null });

    expect(el.textContent).toContain(text.notFound);
  });

  it('reports a refusal instead of navigating away from it', async () => {
    const { el, service, navigateByUrl, press } = await render({
      account: user({ role: 'admin', customerType: null }),
    });
    service.update.mockResolvedValueOnce({ ok: false, code: 'last-admin' });

    await press(defaultAdminText.common.save);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      defaultAdminText.userList.errors['last-admin'],
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
