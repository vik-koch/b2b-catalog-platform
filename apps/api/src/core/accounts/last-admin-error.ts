import { ConflictException } from '@nestjs/common';

/** Raised by `UsersService.removingAdmin`, the one place the rule lives. */
export class LastAdminError extends ConflictException {
  constructor() {
    super({ code: 'last-admin', message: 'This is the last admin account' });
  }
}
