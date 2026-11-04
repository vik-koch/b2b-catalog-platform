import { MailDispatcher } from './mail-dispatcher';
import { MailContent } from './mail-layout';
import { MailEnvelope, MailService } from './mail.service';

/**
 * A real dispatcher over a stubbed MailService, for a spec that asserts what
 * was sent. The queue is real, so the spec has to `await flush()` before
 * reading the stub — which is the behaviour under test: the caller no longer
 * waits for the mail.
 */
export function dispatcherOver(
  send: (content: MailContent, envelope: MailEnvelope) => Promise<void>,
): MailDispatcher {
  return new MailDispatcher({ send } as unknown as MailService);
}
