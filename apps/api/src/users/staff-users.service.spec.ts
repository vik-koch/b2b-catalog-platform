import { CustomerType } from '@b2b-catalog-platform/shared';
import { StaffUser } from '@b2b-catalog-platform/shared/admin';
import { UsersService } from './users.service';
import { StaffUsersService } from './staff-users.service';

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
    const shop = service(['company']);
    // Past the rule, the next thing create does is look the address up.
    const lookup = vi
      .spyOn(
        shop as unknown as { findByEmail: () => Promise<unknown> },
        'findByEmail',
      )
      .mockRejectedValue(new Error('reached the lookup'));

    await expect(
      shop.create({ ...customer, role: 'manager' }, 'admin-1', 'hash'),
    ).rejects.toThrow('reached the lookup');
    expect(lookup).toHaveBeenCalled();
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
