import { Reflector } from '@nestjs/core';
import { TestingModuleBuilder } from '@nestjs/testing';

import { UserRole } from '@b2b-catalog-platform/shared/platform';

import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionUser } from './session-users';
import { Sessions } from './sessions';

/** Who a spec's request is signed in as. */
export interface SignedInAs {
  readonly id: string;
  readonly role: UserRole;
  readonly email?: string;
  readonly tierId?: string | null;
}

/**
 * The real session guards over a session read from `current()`, asked on
 * every request: null is no session. Roles are checked as in production.
 */
export function withSession(
  builder: TestingModuleBuilder,
  current: () => SignedInAs | null,
): TestingModuleBuilder {
  const sessions = {
    read: async () => {
      const user = current();
      return user && { user: user as SessionUser, payload: {} };
    },
    renew: async () => undefined,
  } as unknown as Sessions;
  return builder
    .overrideGuard(JwtAuthGuard)
    .useValue(new JwtAuthGuard(sessions))
    .overrideGuard(OptionalAuthGuard)
    .useValue(new OptionalAuthGuard(sessions))
    .overrideGuard(RolesGuard)
    .useValue(new RolesGuard(new Reflector()));
}
