import { ConflictException } from '@nestjs/common';

/**
 * The refusal every admin-removal path shares. One class rather than three
 * literals: a security rule with three copies is a security rule with three
 * behaviours.
 */
export class LastAdminError extends ConflictException {
  constructor() {
    super({ code: 'last-admin', message: 'This is the last admin account' });
  }
}
