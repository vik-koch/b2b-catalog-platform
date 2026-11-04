import { MailDispatcher } from './mail-dispatcher';
import { MailContent } from './mail-layout';
import { MailEnvelope, MailService } from './mail.service';

/** A real dispatcher over a stubbed send: `await flush()` before reading it. */
export function dispatcherOver(
  send: (content: MailContent, envelope: MailEnvelope) => Promise<void>,
): MailDispatcher {
  return new MailDispatcher({ send } as unknown as MailService);
}
