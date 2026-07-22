import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InquiryModule } from '../inquiry/inquiry.module';
import { MAILER, Mailer } from '../mail/mailer';
import { ThrottlingModule } from './throttling.module';

// Proves the shared limiter actually blocks a flood, exercised
// through the real inquiry route (PublicFormThrottle = 10/min) with the mailer
// stubbed. An isolated app on its own port keeps the per-IP counter clean.
describe('Throttling', () => {
  let app: INestApplication;
  let baseUrl: string;
  const send = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);

  const validSubmission = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    preferredContact: 'email',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlingModule, InquiryModule],
    })
      .overrideProvider(MAILER)
      .useValue({ send } satisfies Mailer)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown): Promise<Response> =>
    fetch(`${baseUrl}/inquiry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('allows requests up to the limit, then answers 429', async () => {
    const statuses: number[] = [];
    // One over the limit of 10: the first ten pass, the eleventh is throttled.
    for (let i = 0; i < 11; i++) {
      statuses.push((await post(validSubmission)).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});
