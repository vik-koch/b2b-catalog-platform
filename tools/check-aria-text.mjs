#!/usr/bin/env node
/**
 * Asserts that a text key named `…Aria` is only ever read out, never shown.
 *
 * The suffix tells a translator that nobody sees the text: it is an accessible
 * name, a screen-reader-only hint or a live announcement, so it can be a full
 * phrase and need not fit a button. That promise breaks silently the day such a
 * key is put on screen, so this follows every read of one in the web app and
 * fails on any that does not end where only assistive technology reads it:
 *
 * - an `aria-label`-like binding, or a component input that only renders one
 *   (`ariaLabel`, `searchLabel`, a `ui-switch`'s `label`);
 * - an interpolation inside a `sr-only` element;
 * - a config field that only renders one (`ariaLabel`, `srLabel`,
 *   `clearLabel`), or one named `…Aria` itself, which carries the promise on
 *   to wherever it is read: the UI library's reads are checked too;
 * - code in a class member whose every read is one of the above.
 *
 * The reverse — a text that is only read out but lacks the suffix — cannot be
 * decided from one read, since the same key may be shown elsewhere. Review
 * catches that; this keeps the suffix from lying.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ARIA_BINDINGS = new Set([
  'attr.aria-label',
  'attr.aria-description',
  'attr.aria-roledescription',
  'attr.aria-valuetext',
  'ariaLabel',
  'searchLabel',
]);
/** Inputs named generically that still only render an accessible name. */
const ARIA_INPUTS = { 'ui-switch': new Set(['label']) };
const ARIA_FIELDS = new Set(['ariaLabel', 'srLabel', 'clearLabel']);

const files = execFileSync(
  'git',
  ['ls-files', 'apps/web/src/app/*.ts', 'libs/ui/src/*.ts'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter((file) => !/\.(spec|fixture|testing)\.ts$/.test(file))
  .map((file) => {
    const source = readFileSync(file, 'utf8');
    // Inline templates hold no backticks of their own (they would end them).
    const templates = [...source.matchAll(/template:\s*`([^`]*)`/g)].map(
      (match) => [match.index, match.index + match[0].length],
    );
    return { file, source, templates };
  });

/** Where position `at` sits in a template: 'aria', 'shown', or null for code. */
function templatePlace({ source, templates }, at) {
  if (!templates.some(([start, end]) => at > start && at < end)) return null;
  const before = source.slice(0, at);
  const open = before.lastIndexOf('="');
  if (open >= 0 && before.lastIndexOf('"', at - 1) === open + 1) {
    const binding = /\[([\w.-]+)\]$/.exec(before.slice(0, open))?.[1];
    if (!binding) return 'shown';
    const tag = /<([\w-]+)[^<]*$/.exec(before.slice(0, open))?.[1];
    return ARIA_BINDINGS.has(binding) || ARIA_INPUTS[tag]?.has(binding)
      ? 'aria'
      : 'shown';
  }
  const interpolation = before.lastIndexOf('{{');
  if (interpolation > before.lastIndexOf('}}')) {
    const element = before.slice(before.lastIndexOf('<', interpolation));
    return /^<[^/][^>]*\bclass="[^"]*\bsr-only\b[^"]*"[^>]*>[^<]*$/.test(
      element,
    )
      ? 'aria'
      : 'shown';
  }
  return 'shown';
}

/** The class member a code position belongs to. */
function memberAt(source, at) {
  for (const line of source.slice(0, at).split('\n').reverse()) {
    const member =
      /^ {2}(?:(?:protected|private|public|readonly|static|async)\s+)*(\w+)\s*[=(<:]/.exec(
        line,
      );
    if (member) return member[1];
  }
  return null;
}

/** Every template read of a member: in its own file, or failing that in any
 * file, for a helper class other components call. */
function memberReads(name, own) {
  const readsIn = (unit) =>
    [...unit.source.matchAll(new RegExp(`\\b${name}\\b`, 'g'))]
      .map((match) => templatePlace(unit, match.index))
      .filter(Boolean);
  const reads = readsIn(own);
  return reads.length ? reads : files.flatMap(readsIn);
}

const problems = [];
for (const unit of files) {
  const { file, source } = unit;
  for (const match of source.matchAll(/\.(\w+Aria)\b/g)) {
    const where = `${file}:${source.slice(0, match.index).split('\n').length}`;
    const place = templatePlace(unit, match.index);
    if (place === 'aria') continue;
    if (place === 'shown') {
      problems.push(`${where}: ${match[1]} is shown`);
      continue;
    }
    const field = /(\w+):\s*(?:fillText\()?[\w.]*$/.exec(
      source.slice(source.lastIndexOf('\n', match.index), match.index),
    )?.[1];
    if (field && (ARIA_FIELDS.has(field) || /Aria$/.test(field))) continue;
    const member = memberAt(source, match.index);
    const reads = member ? memberReads(member, unit) : [];
    if (reads.length === 0 || reads.some((read) => read !== 'aria')) {
      problems.push(
        `${where}: ${match[1]} reaches ${member ?? 'code'}, which is ` +
          (reads.length ? 'shown' : 'not read by a template'),
      );
    }
  }
}

if (problems.length > 0) {
  console.error('A text key named …Aria must only be read out, never shown:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('Every …Aria text is only read out.');
