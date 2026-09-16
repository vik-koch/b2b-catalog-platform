#!/usr/bin/env node
/**
 * Rewrites the Contents block of docs/requirements.md from the document itself.
 *
 * Every requirement is a heading carrying an explicit anchor, so a link to one
 * survives a retitling. The index repeats those titles, which is the one place
 * the document can drift from itself — so it is generated rather than edited.
 *
 * Run after adding, retitling or removing a requirement:
 *   node tools/generate-requirements-index.mjs
 * Pass --check to fail instead of writing, which is what CI wants.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'docs/requirements.md';
const START = '## Contents';

const doc = readFileSync(PATH, 'utf8');
const lines = doc.split('\n');

const sections = [];
let part = null;
for (const line of lines.slice(lines.indexOf(START) + 1)) {
  const heading = line.match(/^### <a id="([^"]+)"><\/a>(.+)$/);
  const item = line.match(/^#### <a id="([^"]+)"><\/a>(\S+) — (.+)$/);
  if (line.startsWith('## ')) part = line.slice(3).trim();
  else if (heading)
    sections.push({ part, anchor: heading[1], title: heading[2], items: [] });
  else if (item)
    sections
      .at(-1)
      .items.push({ anchor: item[1], id: item[2], title: item[3] });
}
if (!sections.length) throw new Error('no requirement headings found');

const out = [START, ''];
for (const part of [...new Set(sections.map((s) => s.part))]) {
  const inPart = sections.filter((s) => s.part === part);
  out.push(
    `**${part}** — ` +
      inPart
        .map((s) => `[${s.anchor.toUpperCase()}](#${s.anchor})`)
        .join(' · '),
    '',
  );
}
for (const s of sections) {
  out.push(`**[${s.title}](#${s.anchor})**`, '');
  for (const i of s.items) out.push(`- [${i.id}](#${i.anchor}) — ${i.title}`);
  out.push('');
}

const from = doc.indexOf(START);
const to = doc.indexOf('\n---\n', from);
const next = doc.slice(0, from) + out.join('\n') + doc.slice(to + 1);

if (process.argv.includes('--check')) {
  if (next !== doc) {
    console.error(
      'docs/requirements.md index is stale — run node tools/generate-requirements-index.mjs',
    );
    process.exit(1);
  }
  console.log(
    `index up to date (${sections.reduce((n, s) => n + s.items.length, 0)} requirements)`,
  );
} else {
  writeFileSync(PATH, next);
  console.log(
    `wrote index (${sections.reduce((n, s) => n + s.items.length, 0)} requirements)`,
  );
}
