import {
  ConflictException,
  Controller,
  ForbiddenException,
  INestApplication,
  InternalServerErrorException,
  PayloadTooLargeException,
  Post,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { oc } from '@orpc/contract';
import { Implement, implement } from '@orpc/nest';
import * as z from 'zod';
import { ContractErrorFilter } from './contract-error.filter';
import { refusals } from './refusals';

const contract = {
  refused: oc
    .route({ method: 'GET', path: '/refused' })
    .errors({ 'tier-key-taken': { status: 409 } })
    .output(z.object({ ok: z.boolean() })),
  unwrapped: oc
    .route({ method: 'GET', path: '/unwrapped' })
    .errors({ 'tier-key-taken': { status: 409 } })
    .output(z.object({ ok: z.boolean() })),
  broken: oc
    .route({ method: 'GET', path: '/broken' })
    .output(z.object({ ok: z.boolean() })),
  guarded: oc
    .route({ method: 'GET', path: '/guarded' })
    .errors({ 'insufficient-role': { status: 403 } })
    .output(z.object({ ok: z.boolean() })),
};

@Controller()
class ProbeController {
  @Implement(contract.refused)
  refused() {
    return implement(contract.refused)
      .use(refusals)
      .handler(async () => {
        throw new ConflictException({
          code: 'tier-key-taken',
          message: 'already in use',
        });
      });
  }

  @Implement(contract.unwrapped)
  unwrapped() {
    return implement(contract.unwrapped).handler(async () => {
      throw new ConflictException({
        code: 'tier-key-taken',
        message: 'already in use',
      });
    });
  }

  @Implement(contract.broken)
  broken() {
    return implement(contract.broken)
      .use(refusals)
      .handler(async () => {
        throw new InternalServerErrorException('the database fell over');
      });
  }

  @Implement(contract.guarded)
  guarded() {
    return implement(contract.guarded).handler(async () => ({ ok: true }));
  }

  /** A plain Nest route, as the two file uploads are. */
  @Post('/uploaded')
  uploaded(): never {
    throw new PayloadTooLargeException({
      code: 'file-too-large',
      message: 'The file exceeds the size limit',
      params: { limit: '5242880' },
    });
  }
}

/** Refuses before the request ever reaches the contract layer, as a guard does. */
class DenyingGuard {
  canActivate(): boolean {
    throw new ForbiddenException({
      code: 'insufficient-role',
      message: 'Insufficient role',
    });
  }
}

describe('carrying a refusal to the client', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: ContractErrorFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards({
      canActivate: (context: { getHandler(): { name: string } }) =>
        context.getHandler().name === 'guarded'
          ? new DenyingGuard().canActivate()
          : true,
    });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, body: await response.json() };
  };

  // The reason `refusals` exists at all. Without it a service's refusal is
  // swallowed and answered as a fault, losing the status and the code — and
  // nothing about that failure is visible to a type check or to a test of the
  // service on its own.
  it('would otherwise turn a service refusal into a 500', async () => {
    expect(await get('/unwrapped')).toEqual({
      status: 500,
      body: {
        defined: false,
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
        message: 'Internal server error',
      },
    });
  });

  it('restates a service refusal as the one the contract declares', async () => {
    expect(await get('/refused')).toEqual({
      status: 409,
      body: {
        defined: true,
        code: 'tier-key-taken',
        status: 409,
        message: 'already in use',
      },
    });
  });

  // A fault is not a refusal, and dressing one up as a code the client can
  // switch on would be worse than the 500.
  it('leaves an uncoded failure as the fault it is', async () => {
    const { status, body } = await get('/broken');

    expect(status).toBe(500);
    expect(body.defined).toBe(false);
  });

  // The uploads are not contract routes, but their refusals go through the
  // same filter — so whatever the wording needs has to survive it. Dropping
  // `params` here would have left the sync page unable to say which limit a
  // file exceeded.
  it('keeps what a non-contract route sent besides the code', async () => {
    const response = await fetch(`${baseUrl}/uploaded`, { method: 'POST' });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      defined: true,
      code: 'file-too-large',
      status: 413,
      message: 'The file exceeds the size limit',
      data: { params: { limit: '5242880' } },
    });
  });

  // A guard throws before oRPC sees the request, so this one is the filter's
  // doing rather than the middleware's — the client cannot tell them apart,
  // which is the point.
  it('carries a guard refusal in the same shape', async () => {
    expect(await get('/guarded')).toEqual({
      status: 403,
      body: {
        defined: true,
        code: 'insufficient-role',
        status: 403,
        message: 'Insufficient role',
      },
    });
  });
});
