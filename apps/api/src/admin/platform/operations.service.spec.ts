import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { env } from '../../env';
import { OperationsService } from './operations.service';

describe('OperationsService build info', () => {
  // `env` is parsed once at import; these two are read straight off it, so
  // patch and restore them rather than re-import the module (which would leak
  // a second parsed copy into later tests).
  const original = { ...env };
  afterEach(() => Object.assign(env, original));
  const service = new OperationsService({} as NodePgDatabase<typeof schema>);

  it('reports the version and deploy time the stack was started with', () => {
    Object.assign(env, {
      APP_VERSION: '1.4.0',
      APP_DEPLOYED_AT: '2026-08-01T10:00:00Z',
    });

    expect(service.getBuildInfo()).toEqual({
      version: '1.4.0',
      deployedAt: '2026-08-01T10:00:00Z',
    });
  });

  it('reports nulls outside a deployed stack', () => {
    // Local dev and a bare `docker compose up` set neither.
    Object.assign(env, { APP_VERSION: undefined, APP_DEPLOYED_AT: undefined });

    expect(service.getBuildInfo()).toEqual({ version: null, deployedAt: null });
  });
});
