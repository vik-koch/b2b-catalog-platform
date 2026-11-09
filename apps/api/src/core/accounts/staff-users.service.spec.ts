import {
  CustomerType,
  StaffUser,
} from '@b2b-catalog-platform/shared/core/accounts';

import { AccountErasure } from './account-erasure';
import { StaffUsersService } from './staff-users.service';
import { UsersService } from './users.service';

/**
 * The staff editor's half of FR-AUTH-13: an account is only ever saved as a
 * kind of customer the shop sells to. Refused before anything is read or
 * written, so no database is needed to see it.
 */
describe('StaffUsersService — accepted customer types (FR-AUTH-13)', () => {
  const service = (types: CustomerType[]) =>
    new StaffUsersService(
      {} as never,
      {} as UsersService,
      {} as AccountErasure,
      [],
      null,
      (value: string) => value,
      types,
    );

  const customer = {
    email: 'buyer@example.com',
    role: 'user' as const,
    tierId: null,
    firstName: 'Ada',
    lastName: 'Byrne',
  };

  it('refuses to create a person in a shop that sells to companies only', async () => {
    await expect(
      service(['company']).create(
        { ...customer, customerType: 'person' },
        'admin-1',
        'hash',
      ),
    ).rejects.toMatchObject({
      response: { code: 'customer-type-not-accepted' },
    });
  });

  it('holds a customer with no type to the list as a person', async () => {
    await expect(
      service(['company']).create(customer, 'admin-1', 'hash'),
    ).rejects.toMatchObject({
      response: { code: 'customer-type-not-accepted' },
    });
  });

  it('refuses a company in a shop that sells to persons only', async () => {
    await expect(
      service(['person']).create(
        {
          ...customer,
          customerType: 'company',
          companyName: 'Byrne Ltd',
          companyRegistrationId: '123456',
        },
        'admin-1',
        'hash',
      ),
    ).rejects.toMatchObject({
      response: { code: 'customer-type-not-accepted' },
    });
  });

  it('asks nothing of a staff account, which is no kind of customer', async () => {
    // Past the rule, the next thing create does is look the address up.
    const findByEmail = vi
      .fn()
      .mockRejectedValue(new Error('reached the lookup'));
    const shop = new StaffUsersService(
      {} as never,
      { findByEmail } as unknown as UsersService,
      {} as AccountErasure,
      [],
      null,
      (value: string) => value,
      ['company'],
    );

    await expect(
      shop.create({ ...customer, role: 'manager' }, 'admin-1', 'hash'),
    ).rejects.toThrow('reached the lookup');
    expect(findByEmail).toHaveBeenCalled();
  });

  it('refuses to save a person from before the rule until staff convert it', async () => {
    const shop = service(['company']);
    vi.spyOn(shop, 'findById').mockResolvedValue({
      id: 'u-1',
      role: 'user',
      status: 'active',
      customerType: 'person',
    } as StaffUser);

    await expect(
      shop.update(
        'u-1',
        {
          firstName: 'Ada',
          lastName: 'Byrne',
          phone: null,
          customerType: 'person',
          companyName: null,
          companyRegistrationId: null,
          tierId: null,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'customer-type-not-accepted' },
    });
  });
});

describe('StaffUsersService.create', () => {
  /** A database that keeps what is inserted. */
  const recording = () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return {
            returning: async () => [
              { ...values, id: 'u-1', createdAt: new Date() },
            ],
          };
        },
      }),
    };
    const service = new StaffUsersService(
      db as never,
      { findByEmail: async () => undefined } as unknown as UsersService,
      {} as AccountErasure,
      [],
      null,
      (value: string) => value,
      ['person', 'company'],
    );
    return { service, inserted };
  };

  it('keeps a tier and a source key off a staff account', async () => {
    const { service, inserted } = recording();

    await service.create(
      {
        email: 'colleague@example.com',
        role: 'manager',
        tierId: '00000000-0000-0000-0000-0000000000aa',
        sourceId: 'C-1',
        firstName: 'Ada',
        lastName: 'Byrne',
      },
      'admin-1',
      'hash',
    );

    expect(inserted[0]).toMatchObject({ tierId: null, sourceId: null });
  });

  /** A database whose checks find nothing and whose insert then collides on
   * `constraint`, as a second create between the two would make it. */
  const racing = (constraint: string) => {
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
      insert: () => ({
        values: () => ({
          returning: () =>
            Promise.reject(
              new Error('Failed query', {
                cause: { code: '23505', constraint },
              }),
            ),
        }),
      }),
    };
    return new StaffUsersService(
      db as never,
      { findByEmail: async () => undefined } as unknown as UsersService,
      {} as AccountErasure,
      [],
      null,
      (value: string) => value,
      ['person', 'company'],
    );
  };

  it('answers an email taken past the check as taken', async () => {
    await expect(
      racing('users_email_unique').create(
        {
          email: 'colleague@example.com',
          role: 'manager',
          tierId: null,
          firstName: 'Ada',
          lastName: 'Byrne',
        },
        'admin-1',
        'hash',
      ),
    ).rejects.toMatchObject({ response: { code: 'email-taken' } });
  });

  it('answers a source key taken past the check as taken', async () => {
    await expect(
      racing('users_sourceId_unique').create(
        {
          email: 'buyer@example.com',
          role: 'user',
          tierId: null,
          sourceId: 'C-1',
          customerType: 'person',
          firstName: 'Ada',
          lastName: 'Byrne',
        },
        'admin-1',
        'hash',
      ),
    ).rejects.toMatchObject({ response: { code: 'source-id-taken' } });
  });
});
