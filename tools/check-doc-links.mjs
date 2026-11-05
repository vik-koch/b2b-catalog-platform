#!/usr/bin/env node
/**
 * Fails on a relative link in the repository's Markdown that leads nowhere: a
 * file or folder that is gone, or an anchor no heading in the target makes.
 * Docs link each other by heading, and renaming one breaks every link to it
 * without a sound.
 *
 * Anchors follow GitHub's slugs: lower case, punctuation dropped, spaces to
 * hyphens, a repeated heading numbered `-1`, `-2`. An explicit `<a id="…">`
 * counts too. Links inside fenced code are examples, not links.
 *
 * Run `node tools/check-doc-links.mjs`; CI runs it as is.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean);
const tracked = new Set(files);
const folders = new Set(
  files.flatMap((file) => {
    const parts = file.split('/');
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
  }),
);
const docs = files.filter((file) => file.endsWith('.md'));

const prose = (file) =>
  readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '');

function slug(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const text = prose(file);
  const anchors = new Set();
  const seen = new Map();
  for (const [, heading] of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = slug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const [, id] of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) {
    anchors.add(id);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

const problems = [];
for (const doc of docs) {
  for (const [, link] of prose(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z+.-]*:/i.test(link)) continue;
    const [path, fragment] = link.split('#');
    const target = path
      ? normalize(join(dirname(doc), decodeURIComponent(path)))
      : doc;
    const clean = target.replace(/\/$/, '');
    if (!tracked.has(clean) && !folders.has(clean)) {
      problems.push(`${doc}  links ${link}: no such file or folder`);
      continue;
    }
    // A line anchor (`#L42`) into code is not a heading.
    if (fragment && clean.endsWith('.md')) {
      if (!anchorsOf(clean).has(decodeURIComponent(fragment).toLowerCase())) {
        problems.push(`${doc}  links ${link}: no such heading`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `tools/check-doc-links.mjs: ${docs.length} documents, links resolve.`,
);
