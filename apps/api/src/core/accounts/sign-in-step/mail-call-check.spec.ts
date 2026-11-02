import { MailService } from '../../mail/mail.service';
import { demoMailText } from '../../mail/mail-text.fixture';
import { MailCallCheck, STAND_IN_PATH } from './mail-call-check';

describe('MailCallCheck', () => {
  const send = vi.fn();
  const check = () =>
    new MailCallCheck({ send } as unknown as MailService, demoMailText);
  const request = { phone: '+494012345678', email: 'jane@example.com' };

  /** The reference the mailed link carries. */
  const linked = () => {
    const [content, envelope] = send.mock.calls.at(-1) as [
      { action: { path: string } },
      { to: string },
    ];
    expect(envelope).toEqual({ to: 'jane@example.com' });
    return content.action.path.slice(STAND_IN_PATH.length);
  };

  beforeEach(() => send.mockReset());

  it('mails a link that stands in for the call', async () => {
    const calls = check();
    const started = await calls.start(request);

    expect(linked()).toBe(started.reference);
    expect(await calls.status(started.reference)).toBe('pending');
  });

  it('counts the opened link as the call', async () => {
    const calls = check();
    const { reference } = await calls.start(request);

    expect(calls.answer(reference)).toBe(true);
    expect(await calls.status(reference)).toBe('confirmed');
  });

  // As a provider's spent check: the link stops working once it was told.
  it('forgets a check once it was told confirmed', async () => {
    const calls = check();
    const { reference } = await calls.start(request);
    calls.answer(reference);
    await calls.status(reference);

    expect(await calls.status(reference)).toBe('expired');
    expect(calls.answer(reference)).toBe(false);
  });

  it('knows no check it did not start', async () => {
    const calls = check();

    expect(calls.answer('made-up')).toBe(false);
    expect(await calls.status('made-up')).toBe('expired');
  });

  it('ends a check when its time is over', async () => {
    vi.useFakeTimers();
    try {
      const calls = check();
      const { reference, expiresInMs } = await calls.start(request);
      vi.advanceTimersByTime(expiresInMs);

      expect(calls.answer(reference)).toBe(false);
      expect(await calls.status(reference)).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts nothing when the mail does not go out', async () => {
    const failing = {
      send: async () => {
        throw new Error('smtp down');
      },
    } as unknown as MailService;

    await expect(
      new MailCallCheck(failing, demoMailText).start(request),
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
