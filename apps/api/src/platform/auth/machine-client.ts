/** Who a machine request is: deliberately not an `AuthUser`, so nothing
 * that reads a person can read it. What a scope means is the exchange's; the
 * guard only compares them. */
export interface MachineClient<Scope extends string = string> {
  id: string;
  name: string;
  scopes: Scope[];
}

/** A request the machine guard has authenticated. */
export interface MachineRequest {
  headers: Record<string, string | string[] | undefined>;
  machine?: MachineClient;
}
