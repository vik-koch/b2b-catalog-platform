import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { CodeDeliveryError } from './code-delivery';
import { HttpCodeDelivery } from './http-code-delivery';

/** Over a real socket: the contract is the status codes and the body. */
describe('HttpCodeDelivery', () => {
  let server: Server;
  let url: string;
  let answer: { status: number; body?: string };
  let received: { auth?: string; body: unknown } | undefined;

  const message = {
    phone: '+494012345678',
    code: '123456',
    text: '123456 is your code.',
    email: 'jane@example.com',
  };

  beforeAll(async () => {
    server = createServer(async (req: IncomingMessage, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      received = { auth: req.headers.authorization, body: JSON.parse(raw) };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body ?? '');
    });
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/send`;
  });

  afterAll(() => server.close());

  beforeEach(() => {
    received = undefined;
  });

  it('posts the phone, the code and the text, never the address', async () => {
    answer = { status: 200 };

    await new HttpCodeDelivery(url, 'a-sidecar-token-1234').send(message);

    expect(received).toEqual({
      auth: 'Bearer a-sidecar-token-1234',
      body: {
        phone: '+494012345678',
        code: '123456',
        text: '123456 is your code.',
      },
    });
  });

  it('expects the code it sent when the provider says nothing', async () => {
    answer = { status: 204 };

    expect(await new HttpCodeDelivery(url, undefined).send(message)).toEqual({
      code: '123456',
    });
  });

  // A flash call: the provider's caller number is the code.
  it('expects the provider’s code when the provider chose one', async () => {
    answer = { status: 200, body: '{"code":"654321"}' };

    expect(await new HttpCodeDelivery(url, undefined).send(message)).toEqual({
      code: '654321',
    });
  });

  it.each([
    [422, 'unreachable'],
    [500, 'unavailable'],
    [401, 'unavailable'],
  ] as const)('reads %i as the number being %s', async (status, reason) => {
    answer = { status };

    await expect(
      new HttpCodeDelivery(url, undefined).send(message),
    ).rejects.toMatchObject({ reason });
  });

  it('is unavailable when the answer is not the contract', async () => {
    answer = { status: 200, body: '{"code":"12"}' };

    await expect(
      new HttpCodeDelivery(url, undefined).send(message),
    ).rejects.toBeInstanceOf(CodeDeliveryError);
  });

  it('is unavailable when nothing listens', async () => {
    await expect(
      new HttpCodeDelivery('http://127.0.0.1:9/send', undefined).send(message),
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
