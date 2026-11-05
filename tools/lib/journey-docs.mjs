/**
 * Renders journeys into documentation, the part every subject shares. A
 * journey is data a spec walks (`apps/api-e2e/src/support/journey/journey.ts`)
 * and this prints, with one table, legend and rule: an empty cell is a
 * reading asserted unchanged. A subject's own states belong in its generator.
 */

/**
 * How one reading prints, plainly: a value needing explanation needs a better
 * name. Mail links to the gallery. A subject may read several inboxes (shop
 * and account holder), so a mail probe is known by its name: `mail`, or one
 * ending in `Mail`.
 */
const isMailProbe = (probe) => probe === 'mail' || probe.endsWith('Mail');

function value(probe, reading, mailPreviewByKind) {
  const one = (entry) => {
    // A message's name may carry what travelled with it (`approved+attached`).
    // The gallery holds that variant where it is worth showing on its own, and
    // otherwise the plain message is the right thing to link at.
    const preview = isMailProbe(probe)
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
 * The journeys, from the literals the spec walks against the API. Every step
 * asserts the whole state, so an empty cell is a reading unchanged and a mail
 * not sent. Steps are folded under the summary line, which is what a reader
 * scans for.
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
