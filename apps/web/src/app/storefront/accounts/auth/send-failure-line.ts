import { fillText } from '@b2b-catalog-platform/shared/platform';

import { formatWait } from './countdown';
import type { CodeSendFailure } from './sign-in.service';

interface SendFailureText {
  readonly unreachableAccount: string;
  readonly unavailable: string;
  readonly limit: string;
}

/** Why a code or a call check could not go out; `limit` names the wait. */
export function sendFailureLine(
  text: SendFailureText,
  failure: CodeSendFailure,
  waitSeconds: number,
  limit = text.limit,
): string {
  switch (failure) {
    case 'unreachable':
      return text.unreachableAccount;
    case 'unavailable':
      return text.unavailable;
    case 'limit':
      return fillText(limit, { time: formatWait(waitSeconds) });
  }
}
