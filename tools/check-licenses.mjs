#!/usr/bin/env node
/**
 * License policy gate for the production dependency tree.
 *
 * Two separate concerns, and this script owns the first:
 *
 *  1. *May we ship this at all?* — a copyleft dependency (GPL/AGPL/SSPL) that
 *     reaches production is a licensing problem for a closed client deployment,
 *     and one nobody notices at `npm install` time. This gate fails CI on any
 *     license outside the allowlist, so the answer is decided when the
 *     dependency lands rather than after it ships.
 *  2. *Attribution* — handled by the build, not here: Angular's `extractLicenses`
 *     emits `3rdpartylicenses.txt` for exactly the code that ends up in the
 *     browser bundle, which the SSR tier serves at `/licenses.txt` and the
 *     /licenses route renders. Nothing is generated into the repo.
 *
 * Scope is `npm ls --omit=dev`: dev tooling is never distributed, so its
 * licenses do not bind us. The production tree over-approximates the browser
 * bundle (it includes server-only packages), which is the safe direction.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** SPDX ids we accept without discussion: permissive, attribution-only. */
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'Unlicense',
  'CC0-1.0',
  'Python-2.0',
  // File-level copyleft. Fine as long as we consume it unmodified, which we do
  // — it arrives as a build-time binary and we never patch its sources.
  'MPL-2.0',
  '(Apache-2.0 AND BSD-3-Clause)',
]);

/**
 * Packages whose license is outside the allowlist but has been reviewed and
 * accepted. Keyed by package name (not version) with the reason, so a reviewer
 * sees why rather than just that. A new entry is a decision, not a formality.
 */
const EXCEPTIONS = new Map([
  [
    '@img/sharp-libvips-linux-x64',
    "sharp's prebuilt libvips, used unmodified and only on the server. LGPL " +
      'permits that, and it never reaches a browser.',
  ],
  [
    '@img/sharp-libvips-linux-arm64',
    'Same as the x64 variant, for the ARM demo/prod hosts.',
  ],
  [
    'caniuse-lite',
    'A browser-support dataset consumed by the build; no part of it is ' +
      'redistributed.',
  ],
]);

/** Reads a license id out of a package.json, tolerating the legacy shapes. */
function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((entry) => entry.type ?? '?').join(' OR ');
  }
  return 'UNKNOWN';
}

function productionPackageDirs() {
  // `npm ls` exits non-zero on any tree quibble (extraneous, peer mismatch)
  // while still printing a usable list, so the exit code is deliberately not
  // treated as fatal — an empty list is what would actually mean failure.
  let stdout = '';
  try {
    stdout = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    stdout = error.stdout ?? '';
  }
  const root = process.cwd();
  return stdout.split('\n').filter((dir) => dir && dir !== root);
}

const dirs = productionPackageDirs();
if (dirs.length === 0) {
  console.error(
    'check-licenses: `npm ls --omit=dev` listed no packages — run `npm ci` first.',
  );
  process.exit(1);
}

const violations = [];
const accepted = [];
const seen = new Set();

for (const dir of dirs) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    violations.push({ id: dir, license: 'unreadable package.json' });
    continue;
  }
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);

  const license = licenseOf(pkg);
  if (ALLOWED.has(license)) continue;

  const exception = EXCEPTIONS.get(pkg.name);
  if (exception) {
    accepted.push({ id, license, exception });
    continue;
  }
  violations.push({ id, license });
}

console.log(`check-licenses: ${seen.size} production packages checked.`);
for (const { id, license, exception } of accepted) {
  console.log(`  reviewed exception: ${id} (${license}) — ${exception}`);
}

if (violations.length > 0) {
  console.error(
    `\ncheck-licenses: ${violations.length} package(s) outside the license policy:`,
  );
  for (const { id, license } of violations) {
    console.error(`  ${id}: ${license}`);
  }
  console.error(
    '\nEither drop the dependency, or — if the license is genuinely acceptable ' +
      'for a distributed client deployment — add it to ALLOWED or EXCEPTIONS in ' +
      'tools/check-licenses.mjs with the reasoning.',
  );
  process.exit(1);
}

console.log('check-licenses: all production licenses within policy.');
