import { syncRuns } from '../db/schema';
import { StagedPayloadError, stagedPayload } from './sync-run-payload';

type RunRow = typeof syncRuns.$inferSelect;

/** A stored run, with only the columns this reads filled in. */
function run(patch: Partial<RunRow>): RunRow {
  return {
    id: 'run-1',
    status: 'previewed',
    area: 'catalog',
    source: 'api',
    filename: null,
    startedAt: new Date(),
    finishedAt: null,
    actorId: null,
    actorEmail: null,
    tokenId: null,
    tokenName: null,
    stagedReason: null,
    options: {},
    summary: null,
    rows: [],
    plan: null,
    parseErrors: null,
    error: null,
    notice: null,
    ...patch,
  } as RunRow;
}

describe('stagedPayload', () => {
  it('reads nothing from a run that has none staged', () => {
    expect(stagedPayload(run({ rows: null }))).toBeNull();
    expect(stagedPayload(run({ options: null }))).toBeNull();
  });

  it('narrows a catalog run to catalog shapes, defaults and all', () => {
    const staged = stagedPayload(
      run({ area: 'catalog', rows: [{ sourceId: 'P-1', name: 'Beans' }] }),
    );
    expect(staged?.area).toBe('catalog');
    if (staged?.area !== 'catalog') throw new Error('expected a catalog run');
    expect(staged.rows).toEqual([{ sourceId: 'P-1', name: 'Beans' }]);
    // The empty `options` object stored above is filled out by the schema, so
    // a run staged before an option existed is read with today's default.
    expect(staged.options.createMissing).toBe(true);
    expect(staged.parseErrors).toEqual([]);
  });

  it('narrows a customer run to customer shapes', () => {
    const staged = stagedPayload(
      run({
        area: 'customers',
        rows: [{ sourceId: 'C-1', email: 'Buyer@Example.test' }],
        parseErrors: [{ row: 2, sourceId: null, code: 'missing-source-id' }],
      }),
    );
    if (staged?.area !== 'customers')
      throw new Error('expected a customer run');
    // Parsed, not asserted: the row schema lowercases the address, which a
    // cast would have left as whatever was stored.
    expect(staged.rows[0].email).toBe('buyer@example.test');
    expect(staged.rows[0].sendPasswordLink).toBe(false);
    expect(staged.parseErrors).toHaveLength(1);
  });

  it('refuses a payload in the other area’s shape', () => {
    // The shape a cast would have waved through, and the reason this parses:
    // a customer row reaching the catalog differ is nonsense the compiler
    // cannot catch, because both columns are typed as the union.
    expect(() =>
      stagedPayload(
        run({ area: 'catalog', rows: [{ sourceId: 'C-1', tierKey: 'trade' }] }),
      ),
    ).toThrow(StagedPayloadError);
  });

  it('refuses a stored payload no schema accepts', () => {
    expect(() =>
      stagedPayload(run({ area: 'catalog', options: { fields: 'all' } })),
    ).toThrow(StagedPayloadError);
  });
});
