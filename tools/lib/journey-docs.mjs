/**
 * Rendering journeys into documentation — the half that is not about orders or
 * about accounts.
 *
 * A journey is data walked by a spec and printed here (see
 * `apps/api-e2e/src/support/journey/journey.ts`), so the two subjects that have
 * journeys today render identically: the same table, the same legend, the same
 * rule that a cell saying nothing is a reading asserted *unchanged* rather than
 * a gap in the documentation. Anything a subject needs of its own — an order's
 * states, an account's statuses — belongs in that subject's generator.
 */

/**
 * How one reading prints. Kept dumb on purpose: a value that needs explaining
 * in the documentation needs a better name in the journey.
 *
 * The exception is mail, where the name of a message is also the way to go and
 * read it — the gallery holds every one of them.
 */
function value(probe, reading, mailPreviewByKind) {
  const one = (entry) => {
    // A message's name may carry what travelled with it (`approved+attached`).
    // The gallery holds that variant where it is worth showing on its own, and
    // otherwise the plain message is the right thing to link at.
    const preview =
      probe === 'mail'
        ? (mailPreviewByKind[entry] ?? mailPreviewByKind[entry.split('+')[0]])
        : undefined;
    if (preview) return `[\`${entry}\`](mail.md#${preview})`;
    // A marker is drawn, not named: backticks around a dot read as code for
    // something, and there is nothing behind it to look up.
    return /^\w/.test(entry) ? `\`${entry}\`` : entry;
  };
  if (Array.isArray(reading)) {
    return reading.length === 0 ? 'nothing' : reading.map(one).join(' · ');
  }
  // A reading nobody has: a guest has no panel, not an empty one.
  if (reading === null) return 'n/a';
  return typeof reading === 'string' ? one(reading) : String(reading);
}

/** What each column of every journey table is answering. */
export function journeyLegend(probes) {
  return Object.values(probes)
    .map((probe) => `- **${probe.label}** — ${probe.meaning}`)
    .join('\n');
}

/**
 * The journeys, from the same literals the spec walks against the running API.
 *
 * A cell that says nothing is not a gap: every step asserts the whole state, so
 * an unmentioned reading is being asserted *unchanged*, and an unmentioned mail
 * is being asserted not to have been sent.
 *
 * Each journey's steps are folded away. There are more of them than anybody
 * reads at once, and the summary line — what the journey is and what it covers
 * — is the part somebody scanning the document is looking for.
 */
export function journeyTables(journeys, probes, mailPreviewByKind, labels) {
  const changes = (expectations) =>
    Object.entries(expectations ?? {})
      .map(
        ([probe, reading]) =>
          `${probes[probe].label}: ${value(probe, reading, mailPreviewByKind)}`,
      )
      .join('<br>') || '—';

  return journeys
    .map((journey) => {
      const rows = journey.steps.map(
        (step, index) =>
          `| ${index + 1} | ${step.what} | ${step.actor} | ${changes(step.expect)} |`,
      );
      const from = journey.from?.length
        ? journey.from.map((step) => step.what).join(' ')
        : labels.fresh;
      return [
        '<details>',
        `<summary><b>${journey.title}</b> — ${journey.note}</summary>`,
        '',
        `**${labels.given}** ${journey.given}`,
        '',
        `**Starting from.** ${from}`,
        '',
        ...(journey.start
          ? [`**Which leaves it.** ${changes(journey.start)}`, '']
          : []),
        '| # | What happens | Who | What changes |',
        '| --- | --- | --- | --- |',
        ...rows,
        '',
        '</details>',
      ].join('\n');
    })
    .join('\n\n');
}
