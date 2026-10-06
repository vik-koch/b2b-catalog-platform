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
import { AuthService } from '../../auth/auth.service';
import { provideOwnership } from '../settings/settings.fixture';
import { TiersService } from '../tiers/tiers.service';
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
  } = {},
) {
  const account = options.account === undefined ? user() : options.account;
  const service = {
    get: vi.fn(async () => account ?? undefined),
    listConsents: vi.fn(async () => options.consents ?? []),
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
        },
      },
      {
        provide: AuthService,
        useValue: { user: () => ({ role: options.role ?? 'admin' }) },
      },
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

  return { el, service, tiers, link, text: () => el.textContent ?? '' };
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
});
