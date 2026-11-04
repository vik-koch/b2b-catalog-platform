import { ApiTokenScope } from '@b2b-catalog-platform/shared';

/** Who a machine request is: deliberately not an `AuthUser`, so nothing
 * that reads a person can read it. */
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
