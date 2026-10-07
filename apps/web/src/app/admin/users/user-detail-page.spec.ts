import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ConsentRecord,
  CustomerTier,
  OwnershipArea,
  StaffUser,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import type { DeploymentConfig } from '../../config/deployment-config.type';
import { AuthService } from '../../auth/auth.service';
import { provideOwnership } from '../settings/settings.fixture';
import { TiersService } from '../tiers/tiers.service';
import { ConfirmService } from '../../ui/confirm.service';
import { ConfirmAnswer } from '../../ui/confirm-dialog';
import { UserDetailPage } from './user-detail-page';
import { StaffUsersService } from './users.service';

const text = defaultAdminText.userDetail;
const listText = defaultAdminText.userList;
const editorText = defaultAdminText.userEditor;

function user(overrides: Partial<StaffUser> = {}): StaffUser {
  return {
    id: 'u1',
    sourceId: null,
    email: 'jane@example.com',
    role: 'user',
    status: 'active',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+490401234567',
    customerType: 'person',
    companyName: null,
    companyRegistrationId: null,
    tierId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    approvedAt: '2026-08-02T00:00:00.000Z',
    approvedBy: 'admin-1',
    phoneConfirmedAt: null,
    signInStepExemptAt: null,
    signInStepExemptBy: null,
    ...overrides,
  };
}

const baseList: CustomerTier = {
  id: 'tier-d',
  key: 'default',
  label: 'Base price list',
  userCount: 0,
  priceCount: 0,
  isDefault: true,
  wouldUnpublish: 0,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const wholesale: CustomerTier = {
  ...baseList,
  id: 'tier-w',
  key: 'wholesale',
  label: 'Wholesale',
  isDefault: false,
};

async function render(
  options: {
    /** `null` is the API's 404. */
    account?: StaffUser | null;
    role?: 'admin' | 'manager';
    ownedAreas?: OwnershipArea[];
    consents?: ConsentRecord[];
    /** Whether the deployment asks for any consent. */
    consentAsked?: boolean;
    /** The signed-in admin's own id. */
    selfId?: string;
    /** How the delete confirmation is answered; null is "no". */
    answer?: ConfirmAnswer | null;
    /** The deployment's code after the password (FR-AUTH-12). */
    signInStep?: DeploymentConfig['signInStep'];
  } = {},
) {
  const account = options.account === undefined ? user() : options.account;
  const service = {
    get: vi.fn(async () => account ?? undefined),
    listConsents: vi.fn(async () => options.consents ?? []),
    deleteOnRequest: vi.fn(async () => ({
      ok: true as const,
      user: user({ status: 'anonymized', firstName: null, lastName: null }),
    })),
    setSignInStepExemption: vi.fn(async (_id: string, exempt: boolean) => ({
      ok: true as const,
      user: user({
        role: 'manager',
        signInStepExemptAt: exempt ? '2026-10-07T00:00:00.000Z' : null,
        signInStepExemptBy: exempt ? 'admin@example.com' : null,
      }),
    })),
  };
  const confirm = {
    ask: vi.fn(async () => true),
    askDetailed: vi.fn(async () =>
      options.answer === undefined
        ? { reason: '', checks: {} }
        : options.answer,
    ),
  };
  const tiers = {
    list: vi.fn(async () => ({
      tiers: [baseList, wholesale],
      productCount: 0,
    })),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserDetailPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          ...defaultDeploymentConfig,
          consent: {
            contact: options.consentAsked ?? false,
            account: options.consentAsked ?? false,
          },
          signInStep: options.signInStep,
        },
      },
      {
        provide: AuthService,
        useValue: {
          user: () => ({ id: options.selfId, role: options.role ?? 'admin' }),
        },
      },
      { provide: ConfirmService, useValue: confirm },
      { provide: StaffUsersService, useValue: service },
      { provide: TiersService, useValue: tiers },
      // Needed, not optional: the real read fails closed, so an unstubbed call
      // renders the locked shape.
      provideOwnership(...(options.ownedAreas ?? [])),
    ],
  });

  const fixture = TestBed.createComponent(UserDetailPage);
  fixture.componentRef.setInput('id', 'u1');
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const link = (label: string) =>
    [...el.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === label,
    ) as HTMLAnchorElement | undefined;

  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return {
    el,
    fixture,
    service,
    tiers,
    confirm,
    link,
    button,
    settle,
    text: () => el.textContent ?? '',
  };
}

describe('UserDetailPage', () => {
  it('reads the account out: who they are, and how to reach them', async () => {
    const { el, text: body } = await render({
      account: user({
        customerType: 'company',
        companyName: 'Acme Ltd',
        companyRegistrationId: 'DE123456789',
      }),
    });

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Doe Jane');
    expect(body()).toContain('jane@example.com');
    expect(body()).toContain('Acme Ltd');
    expect(body()).toContain('DE123456789');
    // The number is stored as bare digits and read back grouped.
    expect(body()).toContain('(040) 123-4567');
  });

  it('shows the two facts the customer never sees of their own account', async () => {
    const { text: body } = await render({
      account: user({ tierId: 'tier-w', sourceId: 'ERP-42' }),
    });

    expect(body()).toContain(editorText.tier);
    expect(body()).toContain('Wholesale');
    expect(body()).toContain(editorText.sourceId);
    expect(body()).toContain('ERP-42');
  });

  it('says what an empty source key means rather than drawing a dash', async () => {
    const { text: body } = await render({ account: user({ sourceId: null }) });

    expect(body()).toContain(text.sourceIdEmpty);
  });

  it('keeps the source key from a manager, as the editor does', async () => {
    const { text: body } = await render({
      account: user({ sourceId: 'ERP-42' }),
      role: 'manager',
    });

    expect(body()).not.toContain('ERP-42');
    expect(body()).not.toContain(editorText.sourceId);
  });

  it('names an account on no tier of its own after the storefront list', async () => {
    const { text: body } = await render({ account: user({ tierId: null }) });

    expect(body()).toContain('Base price list');
  });

  it('reads a staff account with its role, and no tier at all', async () => {
    const { text: body, tiers } = await render({
      account: user({ role: 'manager', customerType: null }),
    });

    expect(body()).toContain(listText.roleManager);
    expect(body()).not.toContain(editorText.tier);
    // Nothing to ask for: a staff account is on no price list.
    expect(tiers.list).not.toHaveBeenCalled();
  });

  it('offers the editor, and carries the way back with it', async () => {
    const { link } = await render();

    const edit = link(listText.edit);
    expect(edit?.getAttribute('href')).toContain('/admin/users/u1/edit');
    expect(link(text.back)?.getAttribute('href')).toContain('/admin/users');
  });

  it('leads a pending registration to the decision, not to a correction', async () => {
    const { link } = await render({ account: user({ status: 'pending' }) });

    expect(link(listText.approve)?.getAttribute('href')).toContain(
      '/admin/users/u1/edit',
    );
    expect(link(listText.edit)).toBeUndefined();
  });

  it('goes back to the staff list from a staff account', async () => {
    const { link } = await render({ account: user({ role: 'admin' }) });

    expect(link(text.back)?.getAttribute('href')).toContain(
      '/admin/users/staff',
    );
  });

  /**
   * The point of the screen while an external system owns customers: it still
   * reads the account out. Only the way into the editor goes, and a banner
   * says where the account is edited instead.
   */
  it('reads an owned account out, without offering the editor', async () => {
    const { link, text: body } = await render({ ownedAreas: ['customers'] });

    expect(body()).toContain('jane@example.com');
    expect(body()).toContain(defaultAdminText.ownership.accountLocked);
    expect(link(listText.edit)).toBeUndefined();
    expect(link(text.back)).toBeDefined();
  });

  it('never locks a staff account against the customer switch', async () => {
    const { link } = await render({
      account: user({ role: 'admin' }),
      ownedAreas: ['customers'],
    });

    expect(link(listText.edit)).toBeDefined();
  });

  it('offers nothing to edit on a closed account', async () => {
    const { link, text: body } = await render({
      account: user({ status: 'anonymized' }),
    });

    expect(body()).toContain(listText.statusAnonymized);
    expect(link(listText.edit)).toBeUndefined();
  });

  describe("deleting on the person's request (FR-ADM-23)", () => {
    it('deletes after confirming, and shows the closed account', async () => {
      const { button, service, settle, text: body } = await render();

      button(text.delete)!.click();
      await settle();

      expect(service.deleteOnRequest).toHaveBeenCalledWith('u1', 'request');
      expect(body()).toContain(listText.statusAnonymized);
      expect(button(text.delete)).toBeUndefined();
    });

    it('does nothing when the confirmation is declined', async () => {
      const { button, service, settle } = await render({ answer: null });

      button(text.delete)!.click();
      await settle();

      expect(service.deleteOnRequest).not.toHaveBeenCalled();
    });

    it('records a withdrawn consent when ticked, where one is asked', async () => {
      const { button, service, confirm, settle } = await render({
        consentAsked: true,
        answer: { reason: '', checks: { consentWithdrawn: true } },
      });

      button(text.delete)!.click();
      await settle();

      expect(confirm.askDetailed).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: [expect.objectContaining({ key: 'consentWithdrawn' })],
        }),
      );
      expect(service.deleteOnRequest).toHaveBeenCalledWith(
        'u1',
        'consent-withdrawn',
      );
    });

    it('offers no consent reason where none is asked or held', async () => {
      const { button, confirm, settle } = await render();

      button(text.delete)!.click();
      await settle();

      expect(confirm.askDetailed).toHaveBeenCalledWith(
        expect.objectContaining({ checks: [] }),
      );
    });

    it('says why when it is refused', async () => {
      const { button, service, settle, text: body } = await render();
      service.deleteOnRequest.mockResolvedValueOnce({
        ok: false,
        code: 'last-admin',
      } as never);

      button(text.delete)!.click();
      await settle();

      expect(body()).toContain(listText.errors['last-admin']);
    });

    it.each([
      ['a manager', { role: 'manager' as const }],
      ['their own account', { selfId: 'u1' }],
      ['a pending registration', { account: user({ status: 'pending' }) }],
      ['a closed account', { account: user({ status: 'anonymized' }) }],
    ])('is not offered to %s', async (_label, options) => {
      const { button } = await render(options);

      expect(button(text.delete)).toBeUndefined();
    });

    // The person's right outranks the switch.
    it('is offered while customers are externally owned', async () => {
      const { button } = await render({ ownedAreas: ['customers'] });

      expect(button(text.delete)).toBeDefined();
    });

    it('is offered on a deactivated account', async () => {
      const { button } = await render({
        account: user({ status: 'disabled' }),
      });

      expect(button(text.delete)).toBeDefined();
    });
  });

  describe('consents (NFR-LEGAL-09)', () => {
    const record: ConsentRecord = {
      id: 'c1',
      purpose: 'account',
      givenAt: '2026-10-05T09:30:00.000Z',
      version: 2,
      label: 'I [consent] to the processing of my details.',
      email: 'jane@example.com',
      phone: null,
      account: { id: 'u1', name: 'Doe Jane', status: 'active' },
      withdrawal: null,
    };

    it("lists a customer's records, with the wording that was ticked", async () => {
      const { el, service } = await render({ consents: [record] });

      expect(service.listConsents).toHaveBeenCalledWith('u1');
      const section = [...el.querySelectorAll('section')].find(
        (s) =>
          s.querySelector('h2')?.textContent?.trim() === text.consentsHeading,
      );
      expect(section?.textContent).toContain(
        'I consent to the processing of my details.',
      );
      // The account is the page: the record does not link back to it.
      expect(section?.querySelector('a[href="/admin/users/u1"]')).toBeNull();
    });

    it('says when a customer has none, while a consent is asked', async () => {
      const { text: body } = await render({ consentAsked: true });

      expect(body()).toContain(text.consentsEmpty);
    });

    // Where nothing is asked, an empty card reads as something missing.
    it('leaves the card out where nothing is asked and nothing was given', async () => {
      const { text: body } = await render({ consentAsked: false });

      expect(body()).not.toContain(text.consentsHeading);
    });

    it('still shows records given while a consent was asked', async () => {
      const { text: body } = await render({
        consentAsked: false,
        consents: [record],
      });

      expect(body()).toContain(text.consentsHeading);
    });

    it("is an admin's only", async () => {
      const { service, text: body } = await render({
        role: 'manager',
        consentAsked: true,
      });

      expect(service.listConsents).not.toHaveBeenCalled();
      expect(body()).not.toContain(text.consentsHeading);
    });

    it('is not asked of staff, who are never asked for one', async () => {
      const { service, text: body } = await render({
        account: user({ role: 'manager' }),
      });

      expect(service.listConsents).not.toHaveBeenCalled();
      expect(body()).not.toContain(text.consentsHeading);
    });
  });

  it('says so when the account is not there — or not theirs to see', async () => {
    const { text: body } = await render({ account: null });

    expect(body()).toContain(text.notFound);
  });

  describe('the code after the password (FR-AUTH-12)', () => {
    const always = {
      mode: 'always' as const,
      roles: ['manager' as const, 'admin' as const],
      exemptableRoles: ['manager' as const],
    };

    it('shows no sign-in card where the deployment asks no code', async () => {
      const { el } = await render({ account: user({ role: 'manager' }) });

      expect(el.textContent).not.toContain(text.signInHeading);
    });

    it('says whether the number is confirmed and how often the code is asked', async () => {
      const { el } = await render({
        account: user({ role: 'manager', phone: '+494012345678' }),
        signInStep: always,
      });

      expect(el.textContent).toContain(text.signInHeading);
      expect(el.textContent).toContain(text.signInPhoneUnconfirmed);
      expect(el.textContent).toContain(text.signInCodeAlways);
    });

    it('says when a remembered browser skips the code', async () => {
      const { el } = await render({
        account: user({ role: 'manager', phone: '+494012345678' }),
        signInStep: { ...always, trustDeviceDays: 30 },
      });

      expect(el.textContent).toContain(
        text.signInCodeAlwaysRemembered.replace('{days}', '30'),
      );
    });

    // Nobody can choose a number at sign-in, so staff must know.
    it('says when no number on the account can take a code', async () => {
      const { el } = await render({
        account: user({ role: 'manager', phone: null }),
        signInStep: always,
      });

      expect(el.textContent).toContain(text.signInPhoneMissing);
    });

    it('names who exempted the account', async () => {
      const { el, button } = await render({
        account: user({
          role: 'manager',
          signInStepExemptAt: '2026-10-07T00:00:00.000Z',
          signInStepExemptBy: 'admin@example.com',
        }),
        signInStep: always,
      });

      expect(el.textContent).toContain('admin@example.com');
      expect(button(text.unexempt)).toBeDefined();
    });

    it('exempts after asking, and shows the result', async () => {
      const { el, service, confirm, button, settle } = await render({
        account: user({ role: 'manager' }),
        signInStep: always,
      });

      button(text.exempt)?.click();
      await settle();
      await settle();

      expect(confirm.ask).toHaveBeenCalled();
      expect(service.setSignInStepExemption).toHaveBeenCalledWith('u1', true);
      expect(el.textContent).toContain('admin@example.com');
    });

    it('offers no exemption for a role the deployment does not list', async () => {
      const { el, button } = await render({
        account: user({ role: 'admin' }),
        signInStep: always,
      });

      expect(el.textContent).toContain(text.signInHeading);
      expect(button(text.exempt)).toBeUndefined();
    });

    it('offers no exemption to a manager', async () => {
      const { button } = await render({
        role: 'manager',
        account: user({ role: 'user' }),
        signInStep: { ...always, roles: ['user'], exemptableRoles: ['user'] },
      });

      expect(button(text.exempt)).toBeUndefined();
    });
  });
});
