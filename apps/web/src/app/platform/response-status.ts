import { inject, RESPONSE_INIT } from '@angular/core';

/** Sets the status of a server-rendered response; in the browser the status
 * line has gone out already. Call in an injection context. */
export function setResponseStatus(status: number): void {
  const response = inject(RESPONSE_INIT, { optional: true });
  if (response) response.status = status;
}
