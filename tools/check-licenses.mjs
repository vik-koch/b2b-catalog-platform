#!/usr/bin/env node
/**
 * The licence gate for the production dependency tree: CI fails on any licence
 * outside the allowlist, so a copyleft dependency (GPL/AGPL/SSPL) a closed
 * deployment cannot ship is caught when it lands. Attribution is the build's:
 * `extractLicenses` writes `3rdpartylicenses.txt`, served at `/licenses.txt`.
 *
 * Scope is `npm ls --omit=dev`: dev tooling is never distributed. The
 * production tree covers more than the browser bundle, the safe direction.
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
  'Zlib',
  'BlueOak-1.0.0',
  'Unlicense',
  'CC0-1.0',
  'Python-2.0',
  // File-level copyleft, fine unmodified: a build-time binary whose sources
  // are never patched.
  'MPL-2.0',
]);

/** Whether a licence expression passes. They are simple (SPDX ids joined by OR
 * or AND), so no parser: OR passes on any allowed choice, AND only on all.
 * Mixed ones go to a human. */
function isAllowed(expression) {
  const clean = expression
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  if (ALLOWED.has(clean)) return true;
  const hasOr = / OR /i.test(clean);
  const hasAnd = / AND /i.test(clean);
  if (hasOr && !hasAnd) return clean.split(/ OR /i).some(isAllowed);
  if (hasAnd && !hasOr) return clean.split(/ AND /i).every(isAllowed);
  return false;
}

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
  // while still printing a usable list, so its exit code is not fatal; an
  // empty list is.
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
  if (isAllowed(license)) continue;

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
