#!/usr/bin/env node
/**
 * Holds the comment rule for what a linter cannot see, in every JavaScript and
 * TypeScript file of the repository, `tools/` and the configs included:
 *
 * - No em dash as punctuation. One inside a code span quotes real output
 *   (a page title) and is left alone.
 * - A path a comment names must exist: from the root, relative to the file, or
 *   as the tail of a tracked path (`platform/orpc-client.ts`). Files move, and
 *   a comment pointing at the old place sends the reader nowhere.
 *
 * Run `node tools/check-comments.mjs`; CI runs it as is.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';

/** Names the build or the server produces: they exist only in a running shop. */
const PRODUCED = new Set(['3rdpartylicenses.txt', 'robots.txt']);

const SOURCE = /\.(ts|mts|cts|js|mjs|cjs)$/;

/** A file name with an extension, or a path from a top-level folder. A name
 * that starts with a dot is a suffix (`.contract.ts`), not a file, and one
 * running into a `*`, `<` or `{` is a pattern (`tools/generate-*`). */
const PATH =
  /(?<![\w@:/.-])(?:\.{1,2}\/)?[\w-][\w.-]*(?:\/[\w.-]+)*\.(?:ts|mts|mjs|js|json|md|sql|ya?ml|html|css|sh|txt)(?![\w/*<{])|(?<![\w@:/.-])(?:apps|libs|tools|docs|deployments|infra|\.github)\/[\w./-]*(?![\w./*<{-])/g;

// Untracked files count, so a file not yet staged is neither missed nor missing.
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

/** What the code writes at run time is ignored rather than tracked. */
function ignored(path) {
  try {
    // A pattern like `.media/` matches only a folder, which a missing path
    // cannot show it is.
    execFileSync('git', ['check-ignore', '--no-index', path, `${path}/`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function exists(file, reference) {
  const path = reference.replace(/\/$/, '');
  if (PRODUCED.has(path) || tracked.has(path) || folders.has(path)) return true;
  if (path.startsWith('.')) {
    const target = normalize(join(dirname(file), path));
    // An import-style path names a module without its extension.
    return (
      tracked.has(target) ||
      folders.has(target) ||
      files.some((other) => other.startsWith(`${target}.`))
    );
  }
  return (
    files.some((other) => other.endsWith(`/${path}`)) ||
    (path.includes('/') && ignored(path))
  );
}

/** Every comment once: a range is both one node's trailing and the next's leading. */
function commentsOf(file) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const ranges = new Map();
  const add = (found) =>
    found?.forEach((range) => ranges.set(range.pos, range));
  const visit = (node) => {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  return [...ranges.values()].map((range) => ({
    line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
    text: text.slice(range.pos, range.end),
  }));
}

const problems = [];
for (const file of files.filter(
  (name) => SOURCE.test(name) && !/\.generated\.ts$|\.d\.ts$/.test(name),
)) {
  for (const comment of commentsOf(file)) {
    const prose = comment.text.replace(/`[^`\n]*`/g, '');
    if (prose.includes('—')) {
      problems.push(
        `${file}:${comment.line}  em dash: use a colon or a full stop`,
      );
    }
    for (const [reference] of comment.text.matchAll(PATH)) {
      if (!exists(file, reference)) {
        problems.push(
          `${file}:${comment.line}  names ${reference}, which does not exist`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('tools/check-comments.mjs: comments clean.');
