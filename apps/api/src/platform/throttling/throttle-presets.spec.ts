import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OrderTokenThrottle,
  SidecarSuggestionThrottle,
} from './throttle-presets';
import { ThrottlingModule } from './throttling.module';

/**
 * The two presets iteration 7 added, on routes of their own rather than on the
 * real ones: what is under test is the policy each preset declares, and a stub
 * needs neither a database nor a sidecar to prove a ceiling.
 *
 * `throttling.spec.ts` proves the shared limiter blocks a flood at all, through
 * the inquiry route. These pin the two numbers that are a security control
 * (NFR-SEC-06) and a billing control (NFR-SEC-08) rather than a nicety — the
 * kind that is quietly raised and never noticed.
 */
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

  // The mailed order link's token is its only credential (ADR 0038), and this
  // ceiling is what makes guessing at one pointless as well as hopeless.
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
