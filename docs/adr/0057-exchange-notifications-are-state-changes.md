# 0057 — Tell the shop about an exchange on a change of state, not on a run

**Status:** accepted · **Date:** 2026-09-11

## Context

An automated catalog feed (ADR 0054, ADR 0055) runs on its own clock, as often
as every twenty minutes. Two things it produces need a person: a run held back
for review, and a feed that has stopped working. Both are already visible in
the admin panel — the staged count beside the sync row, the last-applied
timestamp under it — but nobody watches a panel overnight, which is what the
feed is for.

The naive design mails per run. A feed that breaks at midnight then writes the
same message seventy times before anybody opens one, and the seventy-second is
the message that teaches somebody to filter the shop's mail into a folder.

Alternatives considered: a mail outbox with a short hold, where a pending
message is replaced by a newer one about the same subject before it is sent;
storing "we have told them" on the run; fanning the messages out to whoever
holds an admin account.

## Decision

- **A message is sent when the feed's state changes**, not when a run finishes.
  The state is `ok`, `waiting` or `failed`, read off the run before this one:
  the first failure after things were working is announced, its repetitions are
  not; the recovery is announced; something starting to wait is announced, and a
  staged run replacing a staged run is not.
- **Nothing is stored to make this work.** The previous run is the same fact and
  cannot drift from itself, and a feed running every twenty minutes would
  otherwise accumulate a flag nobody clears.
- **One message is not a transition**: a run that applied _itself_ and created
  records a person still has to finish. It is news that arrived while nobody was
  looking, and there is no state for it to be in. A run a person applied
  themselves announces nothing — they have just read the preview that says what
  it does.
- **Audience is a property of the message.** `admins` is a decision to take or
  news to act on, and goes to the deployment's admin address. `fault` is
  something the platform depends on having broken; it goes to the same address
  and, where a deployment names an operator, to them as well.
- **Mail is never retried and never fails a run.** A failed send is logged and
  dropped.
- **The panel is the durable channel**, and it depends on none of this: the
  staged count and the last-sync line are read off the runs themselves.

## Rationale

**A change of state is the same idea a hold was reaching for, without the
machinery.** A timed outbox would dedupe by coalescing messages inside a
window, which means picking a window: too short and a nightly failure still
writes seven messages, too long and a staged run waits in a queue before the
admin hears of it. The feed's state answers it exactly, at any cadence, with a
query that already has an index.

**The panel being the record is what makes losing a message acceptable.** A
notification that must not be lost needs storage, retries and somewhere to show
that it was never delivered — three mechanisms whose absence is only safe
because the thing being announced is _also_ a count on a screen. So the
requirement (FR-NOTIF-09) says the panel still holds it, and that is the whole
justification for the send being fire-and-forget.

**The admin address, not the accounts holding the admin role.** An address
works on a deployment that has no admin account yet, points at a distribution
list where the shop wants one, and does not change silently when somebody is
deactivated or has a personal address on their account. It is also not the
staff inbox: every link in these messages opens a screen a manager gets a 403
on.

**The operator is copied, not substituted.** An admin cannot fix a broken
exchange, but they are the one who notices the shop going stale and who asks —
so a failure that went only to an operator would leave the person answering
customers as the last to know.

## Consequences

- (+) A feed's cadence is free: a deployment can import every fifteen minutes
  without anybody's inbox noticing.
- (+) Iteration 13's order exchange inherits the whole mechanism — the audiences,
  the rule, the fire-and-forget send — and adds messages, not machinery.
- (+) No table, no timer, no queue to inspect when somebody asks whether a
  message went out.
- (−) A message that fails to send is gone: nobody is told twice. What it was
  about is still in the panel, which is the trade being made, but a deployment
  with broken SMTP learns about it from the panel rather than from the mail.
- (−) Silence carries meaning, and a reader has to know that. "No message" means
  "nothing changed", not "nothing ran" — the last-sync line is what answers the
  second question.
- (−) The state is derived from the newest automated run, so anything that
  deletes runs (the retention window, a restore) can make the next run announce
  itself as though it were the first. Harmless, and the alternative is the
  stored flag this avoids.
