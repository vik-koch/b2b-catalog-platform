import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceState } from '../../core/site/maintenance-state';
import { MaintenanceGuard } from '../../core/site/maintenance.guard';

/** Over a real server: the gate must find the exemption on a handler the
 * contract layer registered. */
describe('MaintenanceController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let maintenanceOn = false;
  const state = { isEnabled: () => maintenanceOn };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        { provide: MaintenanceState, useValue: state },
        // The real gate, with no session to find.
        {
          provide: APP_GUARD,
          inject: [Reflector],
          useFactory: (reflector: Reflector) =>
            new MaintenanceGuard(
              reflector,
              state as never,
              { verifyAsync: async () => ({}) } as never,
              { findById: async () => null } as never,
            ),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    maintenanceOn = false;
  });

  it('answers the public maintenance check to anyone', async () => {
    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  it('keeps answering it while maintenance is on', async () => {
    maintenanceOn = true;

    const response = await fetch(`${baseUrl}/api/maintenance`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
  });
});
