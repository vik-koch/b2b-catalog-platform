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
 */
import { readFileSync } from 'node:fs';

const STATS = 'dist/apps/web/stats.json';

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

/** Every chunk reachable from the entry by a static import — the first load. */
const initial = new Set();
const pending = [entry];
while (pending.length > 0) {
  const chunk = pending.pop();
  if (!chunk || initial.has(chunk) || !outputs[chunk]) continue;
  initial.add(chunk);
  for (const imported of outputs[chunk].imports ?? []) {
    if (imported.kind === 'import-statement') pending.push(imported.path);
  }
}

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
