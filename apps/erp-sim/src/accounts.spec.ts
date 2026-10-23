import { Account, claimsFor } from './accounts';

const rules = { keyPrefix: 'CUS-', tiers: ['academic', 'contract', null] };

const account = (overrides: Partial<Account>): Account => ({
  id: 'id',
  sourceId: null,
  state: 'pending',
  createdAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('claimsFor', () => {
  const book: Account[] = [
    account({ id: 'a1', sourceId: 'CUS-1001', state: 'active' }),
    account({ id: 'a2', sourceId: 'CUS-1015', state: 'invited' }),
    account({ id: 'a3', sourceId: 'OTHER-9999', state: 'active' }),
    account({ id: 'p2', createdAt: '2026-10-03T00:00:00Z' }),
    account({ id: 'p1', createdAt: '2026-10-02T00:00:00Z' }),
    account({ id: 'ok', state: 'active' }),
    account({ id: 'gone', state: 'withdrawn' }),
  ];

  it('claims every pending registration by its id, oldest first, keyed after the highest of its own keys', () => {
    expect(
      claimsFor(book, rules).map(({ sourceId, accountId }) => [
        accountId,
        sourceId,
      ]),
    ).toEqual([
      ['p1', 'CUS-1016'],
      ['p2', 'CUS-1017'],
    ]);
  });

  it('approves each claim and puts it on one of the price lists', () => {
    for (const row of claimsFor(book, rules)) {
      expect(row.access).toBe('enabled');
      expect(rules.tiers).toContain(row.tierKey);
    }
  });

  it('proposes the same rows for the same book, cycle after cycle', () => {
    expect(claimsFor(book, rules)).toEqual(
      claimsFor([...book].reverse(), rules),
    );
  });

  it('starts at 1001 in a book without keys of its own', () => {
    expect(claimsFor([account({ id: 'p' })], rules)[0].sourceId).toBe(
      'CUS-1001',
    );
  });

  it('has nothing to do when nobody is waiting', () => {
    expect(claimsFor(book.slice(0, 3), rules)).toEqual([]);
  });
});
