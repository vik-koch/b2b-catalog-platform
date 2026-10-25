#!/usr/bin/env node
/**
 * Asserts that the browser's first load carries no validation runtime.
 *
 * ADR 0043 keeps Zod out of the initial bundle by splitting plain constants
 * away from the schemas that use them, and by handing the client generated
 * route metadata instead of contracts. Neither is enforced by the type system:
 * one constant added back to a `*.contract.ts` and imported by an eagerly
 * loaded component silently returns ~118 kB, because a bundler cannot drop a
 * module's `z.string()` calls to keep only its constants.
 *
 * The size budget is not that guard. It is a tripwire that has been raised as
 * the app grew, so it says "bigger than last time we looked", not "the rule
 * broke". This says exactly which rule broke.
 *
 * Needs the stats file: `npx nx build web --statsJson`.
 *
 * `--report` also prints what the first load is made of and what each lazy
 * entry adds on top of it, gzipped sizes included. `--save <file>` keeps that
 * report as JSON, and `--baseline <file>` prints the change against one kept
 * earlier. CI runs neither.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

const STATS = 'dist/apps/web/browser-stats.json';
const BROWSER = 'dist/apps/web/browser';

const { values: args } = parseArgs({
  options: {
    report: { type: 'boolean' },
    save: { type: 'string' },
    baseline: { type: 'string' },
  },
});

/** Modules that must never be reachable without a lazy chunk boundary. */
const FORBIDDEN = [
  { label: 'zod', match: (path) => /(^|\/)node_modules\/zod\//.test(path) },
];

let stats;
try {
  stats = JSON.parse(readFileSync(STATS, 'utf8'));
} catch {
  console.error(
    `check-initial-bundle: ${STATS} not found — run \`npx nx build web --statsJson\` first.`,
  );
  process.exit(1);
}

const outputs = stats.outputs ?? {};
const entry = Object.keys(outputs).find((name) => /^main-.*\.js$/.test(name));
if (!entry) {
  console.error('check-initial-bundle: no browser entry chunk in the stats.');
  process.exit(1);
}

/** The chunks reachable from `start` by static imports, minus `loaded`. */
function closure(start, loaded = new Set()) {
  const chunks = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const chunk = pending.pop();
    if (!chunk || chunks.has(chunk) || loaded.has(chunk) || !outputs[chunk]) {
      continue;
    }
    chunks.add(chunk);
    for (const imported of outputs[chunk].imports ?? []) {
      if (imported.kind === 'import-statement') pending.push(imported.path);
    }
  }
  return chunks;
}

/** The first load. */
const initial = closure(entry);

const violations = new Map();
let initialBytes = 0;
for (const chunk of initial) {
  initialBytes += outputs[chunk].bytes ?? 0;
  for (const [input, info] of Object.entries(outputs[chunk].inputs ?? {})) {
    const bytes = info.bytesInOutput ?? 0;
    if (bytes === 0) continue;
    for (const { label, match } of FORBIDDEN) {
      if (match(input)) {
        violations.set(label, (violations.get(label) ?? 0) + bytes);
      }
    }
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
// Deliberately not compared against the build's "Initial total", which counts
// styles as well: this number is the JavaScript alone.
console.log(
  `check-initial-bundle: ${initial.size} initial chunks, ${kb(initialBytes)} of JavaScript.`,
);

if (violations.size > 0) {
  for (const [label, bytes] of violations) {
    console.error(
      `\ncheck-initial-bundle: ${label} is in the first load (${kb(bytes)}).`,
    );
  }
  console.error(
    '\nSomething eagerly loaded imports a module that builds schemas. A' +
      '\n`*.contract.ts` export is the usual cause: move the constant or helper' +
      '\nto an import-free module (see ADR 0043) rather than raising the budget.',
  );
  process.exit(1);
}
console.log('check-initial-bundle: no validation runtime in the first load.');

if (args.report || args.save || args.baseline) report();

function report() {
  const size = (chunks) => {
    let raw = 0;
    let gzip = 0;
    for (const chunk of chunks) {
      raw += outputs[chunk].bytes ?? 0;
      gzip += gzipSync(readFileSync(`${BROWSER}/${chunk}`)).length;
    }
    return { raw, gzip };
  };

  // Packages by name, the app by its top-level folder.
  const groupOf = (input) =>
    input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ??
    input.match(/^apps\/web\/src\/app\/([^/.]+)\//)?.[1].replace(/^/, 'web/') ??
    input.match(/^libs\/[^/]+/)?.[0] ??
    'other';
  const groups = {};
  for (const chunk of initial) {
    for (const [input, info] of Object.entries(outputs[chunk].inputs ?? {})) {
      const group = groupOf(input);
      groups[group] = (groups[group] ?? 0) + (info.bytesInOutput ?? 0);
    }
  }

  const lazy = {};
  for (const [chunk, info] of Object.entries(outputs)) {
    // The global stylesheet is an entry too; it is reported as styles.
    if (!info.entryPoint?.endsWith('.ts') || chunk === entry) continue;
    const name = info.entryPoint.replace(/^apps\/web\/src\/app\//, '');
    lazy[name] = size(closure(chunk, initial));
  }

  const css = readdirSync(BROWSER).filter((file) => file.endsWith('.css'));
  const current = {
    initial: size(initial),
    styles: css.reduce(
      (sum, file) => {
        const bytes = readFileSync(`${BROWSER}/${file}`);
        return {
          raw: sum.raw + bytes.length,
          gzip: sum.gzip + gzipSync(bytes).length,
        };
      },
      { raw: 0, gzip: 0 },
    ),
    groups,
    lazy,
  };

  const before = args.baseline
    ? JSON.parse(readFileSync(args.baseline, 'utf8'))
    : null;
  const delta = (now, then) => {
    if (then === undefined) return before ? '  (new)' : '';
    const change = now - then;
    if (Math.abs(change) < 51) return '';
    return `  (${change > 0 ? '+' : '−'}${kb(Math.abs(change))})`;
  };
  const line = (label, now, then) =>
    `  ${label.padEnd(48)} ${kb(now.raw).padStart(9)} ${kb(now.gzip).padStart(9)} gzip` +
    delta(now.raw, then?.raw);

  console.log('\nFirst load:');
  console.log(line('JavaScript', current.initial, before?.initial));
  console.log(line('styles', current.styles, before?.styles));

  console.log('\nLargest in the first load (before compression):');
  for (const [group, bytes] of Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    console.log(
      `  ${group.padEnd(48)} ${kb(bytes).padStart(9)}` +
        delta(bytes, before?.groups[group]),
    );
  }

  console.log('\nLazy entries, on top of the first load:');
  for (const [name, now] of Object.entries(lazy).sort(
    (a, b) => b[1].raw - a[1].raw,
  )) {
    console.log(line(name, now, before?.lazy[name]));
  }
  for (const name of Object.keys(before?.lazy ?? {})) {
    if (!(name in lazy)) console.log(`  ${name.padEnd(48)} (gone)`);
  }

  if (args.save) {
    writeFileSync(args.save, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`\ncheck-initial-bundle: report saved to ${args.save}.`);
  }
}
