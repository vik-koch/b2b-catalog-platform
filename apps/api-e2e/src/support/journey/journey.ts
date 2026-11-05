import { expect } from 'vitest';

/**
 * A journey: steps through one subject's life, as data. It asks what only
 * several moves accumulate: the customer's version, what they were told,
 * whether an old document stands. Data, as the runner asserts it against the
 * API and the `tools/generate-*` scripts render it, so checks and docs are one.
 * Each subject supplies an adapter; nothing here knows one.
 */

/** What a probe reads. A `state` probe carries forward: silence asserts no
 * change. An `event` probe (mail) does not: silence asserts nothing happened.
 * That makes sparse journeys safe. */
export type ProbeKind = 'state' | 'event';

export interface Probe<Ctx> {
  /** How this reading is named in the documentation. */
  readonly label: string;
  readonly kind?: ProbeKind;
  /** What an event probe reads when nothing happened. Ignored for state. */
  readonly quiet?: unknown;
  read(ctx: Ctx, cache: Map<string, unknown>): Promise<unknown>;
}

export interface JourneyAction<Ctx> {
  /** How this operation is named in the documentation. */
  readonly label: string;
  run(ctx: Ctx, args: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface JourneyAdapter<Ctx> {
  readonly actions: Readonly<Record<string, JourneyAction<Ctx>>>;
  readonly probes: Readonly<Record<string, Probe<Ctx>>>;
}

export interface JourneyStep {
  /** What happens, in the words the documentation uses. */
  readonly what: string;
  readonly actor: 'customer' | 'manager' | 'admin' | 'system';
  readonly action: string;
  readonly args?: Readonly<Record<string, unknown>>;
  /**
   * What this step changes. Everything unmentioned is asserted unchanged (a
   * state probe) or asserted not to have happened (an event probe), so a step
   * with no expectations at all is the claim that nothing observable moved.
   */
  readonly expect?: Readonly<Record<string, unknown>>;
}

export interface Journey {
  readonly slug: string;
  readonly title: string;
  /** What this journey is for: the case no other covers. */
  readonly note: string;
  /** The order it starts from, in prose: how it was placed and paid for. */
  readonly given: string;
  /**
   * How the subject reaches the state this journey is about.
   *
   * Run, never asserted, and rendered as prose. A journey may start wherever it
   * likes, but it has to get there the way production does: `notifiedStatuses`,
   * version numbers and document validity are exactly the facts these tests
   * exist to check, and a row inserted at `ready` would be asserting against a
   * precondition somebody made up.
   */
  readonly from?: readonly JourneyStep[];
  /** Asserted against the state the journey actually starts in. */
  readonly start?: Readonly<Record<string, unknown>>;
  readonly steps: readonly JourneyStep[];
}

/**
 * One journey in progress. The spec drives it a step at a time so that a
 * failure names the step it happened on rather than the whole journey.
 */
export class JourneyRun<Ctx> {
  private expected: Record<string, unknown> = {};

  constructor(
    private readonly adapter: JourneyAdapter<Ctx>,
    private readonly ctx: Ctx,
  ) {}

  /** Runs the precondition and takes the reading everything else is measured
   * against. Mail sent along the way is drained here, not asserted: it belongs
   * to the setup and was checked by whichever journey is about those moves. */
  async begin(journey: Journey): Promise<void> {
    for (const step of journey.from ?? []) await this.act(step);
    this.expected = await this.readAll();
    if (journey.start) {
      expect(this.slice(Object.keys(journey.start))).toEqual(journey.start);
    }
  }

  async step(step: JourneyStep): Promise<void> {
    await this.act(step);

    for (const [name, probe] of Object.entries(this.adapter.probes)) {
      if (probe.kind === 'event') this.expected[name] = probe.quiet;
    }
    for (const [name, value] of Object.entries(step.expect ?? {})) {
      if (!(name in this.adapter.probes)) {
        throw new Error(`${step.what}: nothing reads "${name}"`);
      }
      this.expected[name] = value;
    }

    expect(await this.readAll()).toEqual(this.expected);
  }

  private async act(step: JourneyStep): Promise<void> {
    const action = this.adapter.actions[step.action];
    if (!action) throw new Error(`${step.what}: no action "${step.action}"`);
    await action.run(this.ctx, step.args ?? {});
  }

  /**
   * Every probe, from one moment. The cache is what lets a dozen readings cost
   * two HTTP calls: probes that come from the same response ask for it once.
   */
  private async readAll(): Promise<Record<string, unknown>> {
    const cache = new Map<string, unknown>();
    const reading: Record<string, unknown> = {};
    for (const [name, probe] of Object.entries(this.adapter.probes)) {
      reading[name] = await probe.read(this.ctx, cache);
    }
    return reading;
  }

  private slice(names: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(names.map((name) => [name, this.expected[name]]));
  }
}

/** Memoises one reading for the length of a single snapshot. */
export async function cached<T>(
  cache: Map<string, unknown>,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  if (!cache.has(key)) cache.set(key, await read());
  return cache.get(key) as T;
}
