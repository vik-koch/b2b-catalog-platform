import { ApiTokenScope } from '@b2b-catalog-platform/shared';

/**
 * Who a machine request is, once its token has been checked. The counterpart of
 * `AuthUser`, and deliberately not one: there is no person here, so nothing
 * that reads a user should be able to read this by accident.
 */
export interface MachineClient {
  id: string;
  name: string;
  scopes: ApiTokenScope[];
}

/** A request the machine guard has authenticated. */
export interface MachineRequest {
  headers: Record<string, string | string[] | undefined>;
  machine?: MachineClient;
}
