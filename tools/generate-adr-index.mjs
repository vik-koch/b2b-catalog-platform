#!/usr/bin/env node
/**
 * Fills the generated index in `docs/adr/README.md` from the ADRs themselves:
 * number, title, date and status, read from each record's heading and status
 * line. The prose around the index is written by hand and left alone.
 *
 * Run `node tools/generate-adr-index.mjs` after adding an ADR or changing a
 * status line. `--check` verifies the committed index matches, which is what
 * CI runs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  formatted,
  injectSection,
  writeOrCheck,
} from './lib/generated-docs.mjs';

const DIR = 'docs/adr';
const DOC = `${DIR}/README.md`;
const COMMAND = 'tools/generate-adr-index.mjs';

const files = readdirSync(DIR)
  .filter((file) => /^\d{4}-.+\.md$/.test(file))
  .sort();

const link = (number) => {
  const file = files.find((name) => name.startsWith(`${number}-`));
  if (!file) throw new Error(`ADR ${number} is referenced but missing`);
  return `[${number}](${file})`;
};

function describe(file) {
  const text = readFileSync(`${DIR}/${file}`, 'utf8');
  const heading = text.match(/^# (\d{4}) — (.+)$/m);
  if (!heading) throw new Error(`${file}: no "# NNNN — Title" heading`);
  // The status line may wrap, so read its whole paragraph.
  const status = text
    .slice(text.indexOf('**Status:**'))
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ');
  const date = status.match(/\*\*Date:\*\* (\d{4}-\d{2}-\d{2})/);
  if (!status.startsWith('**Status:**') || !date) {
    throw new Error(`${file}: no "**Status:** … · **Date:** …" line`);
  }

  const state = status.slice('**Status:**'.length).split(' · ')[0].trim();
  const notes = [];
  const supersededBy = [...state.matchAll(/superseded by ([\d ,and]+)/g)]
    .flatMap((match) => match[1].match(/\d{4}/g))
    .map(link);
  const partly = /partly|; the .+ superseded/.test(state);
  if (supersededBy.length) {
    notes.push(
      `${partly ? 'partly superseded' : 'superseded'} by ${supersededBy.join(', ')}`,
    );
  } else {
    notes.push(state.split(/[ ;(]/)[0]);
  }
  const supersedes = state.match(/supersedes (\d{4})/);
  if (supersedes) notes.push(`supersedes ${link(supersedes[1])}`);
  if (/amended/i.test(status) || /^## Amendment/m.test(text)) {
    notes.push('amended');
  }

  return {
    number: heading[1],
    title: heading[2].trim(),
    file,
    date: date[1],
    status: notes.join(', '),
  };
}

const records = files.map(describe);
const rows = [
  '<!-- prettier-ignore -->',
  '| ADR | Decision | Date | Status |',
  '| --- | --- | --- | --- |',
  ...records.map(
    (adr) =>
      `| ${adr.number} | [${adr.title}](${adr.file}) | ${adr.date} | ${adr.status} |`,
  ),
];

const document = injectSection(
  readFileSync(DOC, 'utf8'),
  'adr-index',
  rows.join('\n'),
);
writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
