import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import {
  AUTH_COOKIE,
  SESSION_HINT_COOKIE,
} from '@b2b-catalog-platform/shared/platform';

import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { SessionController } from './session.controller';
import { SignedInAs, withSession } from './session.fixture';

/** Over a real server, for the cookies and the refusal a handler test cannot
 * see. */
describe('SessionController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInAs: SignedInAs | null = null;

  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'jane@example.com',
    role: 'user' as const,
    firstName: 'Jane',
    mustChangePassword: false,
  };

  beforeAll(async () => {
    const moduleRef = await withSession(
      Test.createTestingModule({
        controllers: [SessionController],
        providers: [{ provide: APP_FILTER, useClass: ContractErrorFilter }],
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

  // The client sends no body at all; the route must not require one.
  it('clears the session on a logout with no body', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain(`${AUTH_COOKIE}=`);
    expect(cookies).toContain(`${SESSION_HINT_COOKIE}=`);
  });

  it('answers /auth/me with the session’s own identity', async () => {
    signedInAs = { ...user };

    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
  });

  it('refuses /auth/me to nobody', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'not-authenticated',
    });
  });
});
