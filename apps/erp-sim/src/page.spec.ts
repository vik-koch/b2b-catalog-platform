import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { PageView, servePage } from './page';

const view = (overrides: Partial<PageView> = {}): PageView => ({
  since: 'Mon 19 Oct, 15:00',
  timeZone: 'Europe/Dublin',
  shopTime: 'Fri 23 Oct, 10:15',
  night: 4,
  workingHour: '2026-10-23 10',
  workingHours: 'every hour from 08:00 to 16:00, Mon, Tue, Wed, Thu, Fri',
  busy: false,
  log: ['2026-10-23T09:00:01.000Z Orders, 2026-10-23 10:00: applied'],
  ...overrides,
});

describe('the reviewer page', () => {
  let server: Server;
  let base: string;
  let runs = 0;
  let current = view();
  let running = false;

  beforeAll(async () => {
    server = servePage(0, {
      path: '/erp',
      view: () => current,
      runNow: async () => {
        if (running) return false;
        runs += 1;
        return true;
      },
    });
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const get = (path: string) => fetch(`${base}${path}`, { redirect: 'manual' });
  const post = (headers: Record<string, string>) =>
    fetch(`${base}/erp/run`, { method: 'POST', headers, redirect: 'manual' });

  it('moves the bare path onto the page', async () => {
    const response = await get('/erp');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/erp/');
  });

  it('shows the clock, the night and the log, escaped', async () => {
    current = view({ log: ['<script>alert(1)</script>'] });
    const response = await get('/erp/');
    const html = await response.text();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('Fri 23 Oct, 10:15');
    expect(html).toContain('night 4');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    current = view();
  });

  it('runs the cycle when the page itself asks, and says so', async () => {
    const before = runs;
    const response = await post({ 'sec-fetch-site': 'same-origin' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/erp/?ran=yes');
    expect(runs).toBe(before + 1);
    expect(await (await get('/erp/?ran=yes')).text()).toContain(
      'The cycle ran',
    );
  });

  it('refuses a press from anywhere else', async () => {
    const before = runs;
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({})).status).toBe(403);
    expect(runs).toBe(before);
  });

  it('starts nothing while a cycle runs', async () => {
    running = true;
    const response = await post({ 'sec-fetch-site': 'same-origin' });
    expect(response.headers.get('location')).toBe('/erp/?ran=busy');
    running = false;
  });

  it('knows nothing outside its path', async () => {
    expect((await get('/elsewhere')).status).toBe(404);
  });
});
