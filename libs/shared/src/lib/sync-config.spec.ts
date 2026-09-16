import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYNC_POLICY,
  decideAutoApply,
  SyncPolicy,
  syncPolicySchema,
} from './sync-config';
import { SyncSummary } from './sync.contract';

const EMPTY: SyncSummary = {
  rows: 0,
  create: 0,
  update: 0,
  softDelete: 0,
  restore: 0,
  unchanged: 0,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  categoriesEmptied: 0,
  keptManual: 0,
  errors: 0,
  fields: [],
};

const summary = (over: Partial<SyncSummary>): SyncSummary => ({
  ...EMPTY,
  ...over,
});

const policy: SyncPolicy = {
  maxCreates: 10,
  maxSoftDeletes: 0,
  maxChangedShare: 0.5,
  maxCategoriesCreated: 2,
  maxCategoriesEmptied: 0,
};

describe('decideAutoApply', () => {
  it('applies the boring case: a few prices moved', () => {
    expect(decideAutoApply(summary({ update: 12 }), 400, policy, false)).toBe(
      null,
    );
  });

  it('stages a run that creates more than the ceiling', () => {
    expect(decideAutoApply(summary({ create: 11 }), 400, policy, false)).toBe(
      'policy',
    );
    expect(decideAutoApply(summary({ create: 10 }), 400, policy, false)).toBe(
      null,
    );
  });

  it('stages any deletion where the ceiling is zero', () => {
    expect(
      decideAutoApply(summary({ softDelete: 1 }), 400, policy, false),
    ).toBe('policy');
  });

  it('stages a run that adds more categories than the ceiling', () => {
    expect(
      decideAutoApply(summary({ categoriesCreated: 3 }), 400, policy, false),
    ).toBe('policy');
    expect(
      decideAutoApply(summary({ categoriesCreated: 2 }), 400, policy, false),
    ).toBe(null);
  });

  it('stages a regrouping no product-level ceiling notices', () => {
    // Thirty products moved out of one category and into a new one: no create,
    // no deletion, and 30 of 400 is well under the share ceiling. What gives it
    // away is the category left with nothing in it.
    expect(
      decideAutoApply(
        summary({ update: 30, categoriesCreated: 1, categoriesEmptied: 1 }),
        400,
        policy,
        false,
      ),
    ).toBe('policy');
  });

  it('stages a run touching too much of the catalog', () => {
    // 210 of 400 is over half, though no single ceiling is breached.
    expect(
      decideAutoApply(summary({ update: 205, create: 5 }), 400, policy, false),
    ).toBe('policy');
  });

  it('judges a first import into an empty catalog by its creates alone', () => {
    // Every share is total when there is nothing there; the creates ceiling is
    // the rule that means anything.
    expect(decideAutoApply(summary({ create: 4 }), 0, policy, false)).toBe(
      null,
    );
    expect(decideAutoApply(summary({ create: 40 }), 0, policy, false)).toBe(
      'policy',
    );
  });

  it('stages a run the caller asked to be doubted, however small', () => {
    expect(decideAutoApply(EMPTY, 400, policy, true)).toBe('requested');
  });

  it('reports the caller’s doubt rather than the policy when both hold', () => {
    // Which one the screen names matters: a large import and one whose parsing
    // is suspect need different attention.
    expect(decideAutoApply(summary({ create: 999 }), 400, policy, true)).toBe(
      'requested',
    );
  });

  it('lets the defaults through the everyday run and stops the sweep', () => {
    expect(
      decideAutoApply(summary({ update: 30 }), 400, DEFAULT_SYNC_POLICY, false),
    ).toBe(null);
    expect(
      decideAutoApply(
        summary({ softDelete: 1 }),
        400,
        DEFAULT_SYNC_POLICY,
        false,
      ),
    ).toBe('policy');
    expect(
      decideAutoApply(
        summary({ categoriesEmptied: 1 }),
        400,
        DEFAULT_SYNC_POLICY,
        false,
      ),
    ).toBe('policy');
  });

  it('keeps loading a policy written before the category ceilings existed', () => {
    const stored = syncPolicySchema.parse({
      maxCreates: 100,
      maxSoftDeletes: 0,
      maxChangedShare: 0.5,
    });
    expect(stored.maxCategoriesCreated).toBe(
      DEFAULT_SYNC_POLICY.maxCategoriesCreated,
    );
    expect(stored.maxCategoriesEmptied).toBe(
      DEFAULT_SYNC_POLICY.maxCategoriesEmptied,
    );
  });
});
