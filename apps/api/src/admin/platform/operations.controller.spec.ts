import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { SignedInAs, withSession } from '../../platform/auth/session.fixture';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

/** Over a real server: the role guards must still find their metadata on a
 * handler the contract layer registered. */
describe('OperationsController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInAs: SignedInAs | null = null;

  beforeAll(async () => {
    const moduleRef = await withSession(
      Test.createTestingModule({
        controllers: [OperationsController],
        providers: [
          {
            provide: OperationsService,
            useValue: {
              getBuildInfo: () => ({ version: '1.5.3', deployedAt: null }),
              listChanges: async () => [],
            },
          },
        ],
      }),
      () => signedInAs,
    ).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signedInAs = null;
  });

  it('refuses the build info to nobody signed in', async () => {
    const response = await fetch(`${baseUrl}/api/settings/build-info`);

    expect(response.status).toBe(401);
  });

  it('gives the build info to a manager, not only an admin', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/build-info`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: '1.5.3',
      deployedAt: null,
    });
  });

  it('keeps the history admin-only', async () => {
    signedInAs = { id: 'manager-1', role: 'manager' };

    const response = await fetch(`${baseUrl}/api/settings/changes`);

    expect(response.status).toBe(403);
  });
});
