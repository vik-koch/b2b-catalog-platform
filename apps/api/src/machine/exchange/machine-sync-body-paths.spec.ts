import { minifyContractRouter } from '@orpc/contract';

import {
  machineCatalogSyncContract,
  machineCustomerSyncContract,
  machineOrderSyncContract,
} from '@b2b-catalog-platform/shared/machine/exchange';

import { MACHINE_SYNC_RUNS_PATHS } from './machine-sync-body-paths';

/** A new area's submit route works until its first export over 100 kB, in
 * production, unless `main.ts` mounts the big parser on it. So the list is
 * checked against the contracts: a submit route missing from it fails. */
function submitRunPaths(): string[] {
  const minified = minifyContractRouter({
    catalog: machineCatalogSyncContract,
    customers: machineCustomerSyncContract,
    orders: machineOrderSyncContract,
  }) as Record<
    string,
    Record<string, { '~orpc': { route: { path: string } } }>
  >;

  return Object.values(minified)
    .map((area) => `/api${area['submitRun']['~orpc'].route.path}`)
    .sort();
}

describe('the paths the large body parser is mounted on', () => {
  it('covers every area that submits a run', () => {
    expect([...MACHINE_SYNC_RUNS_PATHS].sort()).toEqual(submitRunPaths());
  });

  it('leaves out the failure routes, which carry a sentence', () => {
    expect(
      MACHINE_SYNC_RUNS_PATHS.some((path) => path.endsWith('/failures')),
    ).toBe(false);
  });

  it('names paths express will match as prefixes of nothing else', () => {
    for (const path of MACHINE_SYNC_RUNS_PATHS) {
      const others = MACHINE_SYNC_RUNS_PATHS.filter((it) => it !== path);
      expect(others.some((it) => path.startsWith(`${it}/`))).toBe(false);
    }
  });
});
