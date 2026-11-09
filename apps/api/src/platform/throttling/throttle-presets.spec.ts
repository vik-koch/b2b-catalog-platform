import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  OrderTokenThrottle,
  SidecarSuggestionThrottle,
} from './throttle-presets';
import { ThrottlingModule } from './throttling.module';

/** Two presets on stub routes, pinning a security limit (NFR-SEC-06) and a
 * billing one (NFR-SEC-08), the kind quietly raised and never noticed. */
@Controller('presets')
class PresetRoutes {
  @OrderTokenThrottle()
  @Get('order-token')
  orderToken(): string {
    return 'ok';
  }

  @SidecarSuggestionThrottle()
  @Get('sidecar')
  sidecar(): string {
    return 'ok';
  }
}

describe('the iteration-7 throttle presets', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlingModule],
      controllers: [PresetRoutes],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Each route keeps its own counter, so the two cases do not throttle each
   * other despite arriving from one address. */
  async function hammer(path: string, times: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < times; i++) {
      statuses.push((await fetch(`${baseUrl}/presets/${path}`)).status);
    }
    return statuses;
  }

  // The mailed link's token is its only credential; this ceiling makes
  // guessing pointless.
  it('caps the order token at 30 a minute', async () => {
    const statuses = await hammer('order-token', 31);

    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(200));
    expect(statuses[30]).toBe(429);
  });

  // Every call here leaves the deployment for a metered third party, so an
  // unbounded field is a bill as much as an abuse.
  it('caps sidecar suggestions at 60 a minute', async () => {
    const statuses = await hammer('sidecar', 61);

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(200));
    expect(statuses[60]).toBe(429);
  });
});
