import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { CodeDeliveryError } from './code-delivery';
import { HttpCallCheck } from './http-call-check';

/** Over a real socket: the contract is the paths, the status codes and the
 * bodies. */
describe('HttpCallCheck', () => {
  let server: Server;
  let url: string;
  let answer: { status: number; body?: string };
  let received:
    | { method?: string; path?: string; auth?: string; body: unknown }
    | undefined;

  const request = { phone: '+494012345678', email: 'jane@example.com' };

  beforeAll(async () => {
    server = createServer(async (req: IncomingMessage, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      received = {
        method: req.method,
        path: req.url,
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body ?? '');
    });
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });

  afterAll(() => server.close());

  beforeEach(() => {
    received = undefined;
  });

  it('starts a check with the phone only, never the address', async () => {
    answer = {
      status: 200,
      body: '{"callTo":"+78005008275","reference":"201737-542","expiresIn":300}',
    };

    const started = await new HttpCallCheck(url, 'a-sidecar-token-1234').start(
      request,
    );

    expect(received).toEqual({
      method: 'POST',
      path: '/checks',
      auth: 'Bearer a-sidecar-token-1234',
      body: { phone: '+494012345678' },
    });
    expect(started).toEqual({
      callTo: '+78005008275',
      reference: '201737-542',
      expiresInMs: 300_000,
    });
  });

  it('reads 422 as a refused number', async () => {
    answer = { status: 422 };

    await expect(
      new HttpCallCheck(url, undefined).start(request),
    ).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it.each(['pending', 'confirmed', 'expired'] as const)(
    'reads the status %s',
    async (status) => {
      answer = { status: 200, body: JSON.stringify({ status }) };

      expect(await new HttpCallCheck(url, undefined).status('a/b')).toBe(
        status,
      );
      expect(received).toMatchObject({ method: 'GET', path: '/checks/a%2Fb' });
    },
  );

  it.each([
    [
      'a number that is not canonical',
      '{"callTo":"8800","reference":"r","expiresIn":300}',
    ],
    ['no reference', '{"callTo":"+78005008275","expiresIn":300}'],
    ['no body', ''],
  ])('is unavailable when a start answers %s', async (_, body) => {
    answer = { status: 200, body };

    await expect(
      new HttpCallCheck(url, undefined).start(request),
    ).rejects.toBeInstanceOf(CodeDeliveryError);
  });

  it.each([500, 401, 404])(
    'is unavailable when a status answers %i',
    async (status) => {
      answer = { status };

      await expect(
        new HttpCallCheck(url, undefined).status('r'),
      ).rejects.toMatchObject({ reason: 'unavailable' });
    },
  );

  it('is unavailable when nothing listens', async () => {
    await expect(
      new HttpCallCheck('http://127.0.0.1:9', undefined).status('r'),
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
