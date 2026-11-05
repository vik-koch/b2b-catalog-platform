import { AccountErasure } from './account-erasure';
import { UsersService } from './users.service';
import { LastAdminError } from './last-admin-error';
import { Captured, renderingDb } from './rendering-db.fixture';

/**
 * The rule every admin removal shares (self-deletion, deactivation, demotion),
 * so the shop always keeps somebody who can let people in. This asserts the
 * decision and that it wraps the write; the `for update` lock is rendered, but
 * only a real database shows a second caller waiting.
 */
describe('UsersService.removingAdmin', () => {
  const service = (admins: { id: string }[]) =>
    new UsersService(renderingDb([], admins), {} as AccountErasure);

  it('refuses to remove the only admin who can still sign in', async () => {
    const users = service([{ id: 'admin-1' }]);
    const write = vi.fn();

    await expect(users.removingAdmin('admin-1', write)).rejects.toThrow(
      LastAdminError,
    );
    // Refused before the write, not rolled back after it.
    expect(write).not.toHaveBeenCalled();
  });

  it('allows it while another admin remains', async () => {
    const users = service([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await expect(
      users.removingAdmin('admin-1', async () => 'written'),
    ).resolves.toBe('written');
  });

  /**
   * Disabled and anonymized admins cannot sign in, so they do not count: what
   * is protected is the last admin who can use the account. An invited one
   * counts, as the link in their inbox is a way in.
   */
  it('counts only the admins who could still sign in', async () => {
    const locks: Captured[] = [];
    const users = new UsersService(
      renderingDb([], [{ id: 'a' }], locks),
      {} as AccountErasure,
    );

    await users.removingAdmin('a', async () => null).catch(() => undefined);

    expect(locks[0].params).toEqual(['admin', 'active', 'invited']);
  });

  it('writes a non-admin straight through', async () => {
    const users = service([{ id: 'admin-1' }]);

    await expect(
      users.removingAdmin('customer-9', async () => 'written'),
    ).resolves.toBe('written');
  });

  it('locks every admin row, the removed one included', async () => {
    const locks: Captured[] = [];
    const users = new UsersService(
      renderingDb([], [{ id: 'a' }], locks),
      {} as AccountErasure,
    );

    await users.removingAdmin('a', async () => null).catch(() => undefined);

    // Not `id <> removed`: two admins removing each other read disjoint sets,
    // each sees the other, and each proceeds. They have to contend for the
    // same rows, so the removed account's own row is locked with the rest.
    expect(locks[0].table).toBe('users for update');
    expect(locks[0].sql).not.toContain('<>');
    expect(locks[0].params).not.toContain('a');
  });
});
