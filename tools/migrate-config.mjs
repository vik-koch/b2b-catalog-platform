#!/usr/bin/env node
/**
 * Moves a deployment's config directory to the structure of a release, keeping
 * the deployment's own wording and settings.
 *
 *   node migrate-config.mjs --release 1.14.1 --config-dir <dir> [--write]
 *
 * Without `--write` it only reports. The map for a release is
 * `config-migration/<release>.json` beside this script, or `--map <file>`: every
 * new key names the old keys its value comes from, the first one the
 * deployment has wins, and a later one with a different value is reported — a
 * merge that may not hold in that deployment's language. `new` marks wording
 * that did not exist before; `copy` takes a value without moving it, where the
 * old key stays as it is. `moves` carries a whole block to a new place, with
 * whatever is left in it once those keys have gone — into another file too.
 * `files` names the files the deployment had at the release the map starts
 * from, and where each now lives; keys name them by those names, targets by
 * the release's. A file the map does not move keeps its name.
 *
 * Node's built-ins only, so an operator needs no checkout: this file and the
 * map, downloaded from the release tag, are enough. The deployment's files were
 * valid at the release the map starts from — the app does not boot otherwise —
 * and `--check` proves the map turns valid into valid, so all that is left to
 * find here is the counting texts still written in two forms.
 *
 * `--check` is the CI half, run from a checkout after `npm ci`: it migrates the
 * demo config of the release the map starts from (read from git) and validates
 * the result against today's schemas, so a key the map forgot fails CI rather
 * than an operator's boot. It checks the newest map unless told otherwise:
 * older ones end at a structure the schemas have since left, so a deployment
 * several releases behind runs each map in turn.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAPS = join(HERE, 'config-migration');

/** The release's files, and the schema `--check` validates each against. */
const SCHEMAS = {
  'deployment.json': [
    'libs/shared/src/lib/deployment-config.ts',
    'deploymentConfigSchema',
  ],
  'api.json': ['apps/api/src/config/api-config.ts', 'apiConfigSchema'],
  'texts/common.json': [
    'libs/shared/src/lib/common-text.ts',
    'commonTextSchema',
  ],
  'texts/app.json': [
    'apps/web/src/app/config/app-text.type.ts',
    'appTextSchema',
  ],
  'texts/admin.json': [
    'apps/web/src/app/config/admin-text.type.ts',
    'adminTextSchema',
  ],
  'texts/mail.json': ['apps/api/src/mail/mail-text.ts', 'mailTextSchema'],
  'texts/pdf.json': ['apps/api/src/pdf/pdf-text.ts', 'pdfTextSchema'],
};
const FILES = Object.keys(SCHEMAS);
const isText = (file) => file.startsWith('texts/');

const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const check = process.argv.includes('--check');
const write = process.argv.includes('--write');
const configDir = flag('config-dir');
const mapFile =
  flag('map') ??
  join(MAPS, `${flag('release') ?? (check ? newestRelease() : '')}.json`);
if (!existsSync(mapFile) || (!check && !configDir)) {
  console.error(
    'usage: node migrate-config.mjs --release <version> --config-dir <dir> [--write]\n' +
      '       node migrate-config.mjs --map <file> --config-dir <dir> [--write]\n' +
      '       node migrate-config.mjs --check [--release <version>]',
  );
  process.exit(2);
}
const map = JSON.parse(readFileSync(mapFile, 'utf8'));
/** The files a deployment had at the release the map starts from. */
const RENAMES = map.files ?? Object.fromEntries(FILES.map((f) => [f, f]));
const SOURCE_FILES = Object.keys(RENAMES);

function newestRelease() {
  const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  return readdirSync(MAPS)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort(byVersion)
    .at(-1);
}

const split = (key) => {
  const [file, path] = key.split(':');
  return { file, path: path.split('.') };
};
const get = (files, key) => {
  const { file, path } = split(key);
  return path.reduce((node, part) => node?.[part], files[file]);
};
const remove = (files, key) => {
  const { file, path } = split(key);
  const parents = [];
  let node = files[file];
  for (const part of path.slice(0, -1)) {
    if (node?.[part] === undefined) return;
    parents.push([node, part]);
    node = node[part];
  }
  if (node) delete node[path.at(-1)];
  // An object emptied by the move goes too: the schemas have no empty ones.
  for (const [parent, part] of parents.reverse()) {
    if (Object.keys(parent[part]).length > 0) break;
    delete parent[part];
  }
};
const set = (files, key, value) => {
  const { file, path } = split(key);
  let node = (files[file] ??= {});
  for (const part of path.slice(0, -1)) node = node[part] ??= {};
  node[path.at(-1)] = value;
};
const merge = (files, key, block) => {
  const { file, path } = split(key);
  const base = path.filter(Boolean);
  for (const [part, value] of Object.entries(block)) {
    const at = `${file}:${[...base, part].join('.')}`;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merge(files, at, value);
    } else set(files, at, value);
  }
};

/** The deployment's files in the release's structure, and what to tell its
 * operator about them. */
function migrate(original) {
  const files = structuredClone(original);
  const report = { added: [], conflicts: [], dropped: [], missing: [] };
  const values = {};

  // Read every value before moving any: a target may sit where a source was.
  for (const [target, rule] of Object.entries(map.keys)) {
    const found = (rule.from ?? [])
      .map((source) => ({ source, value: get(original, source) }))
      .filter(({ value }) => value !== undefined);
    if (found.length > 0) {
      values[target] = found[0].value;
      const others = found.filter(({ value }) => value !== found[0].value);
      if (others.length > 0) {
        report.conflicts.push({ target, kept: found[0], others });
      }
    } else if (rule.new !== undefined) {
      values[target] = rule.new;
      report.added.push({ target, value: rule.new, file: split(target).file });
    } else if (!rule.optional) {
      report.missing.push(target);
    }
  }
  for (const key of map.drop) {
    const value = get(original, key);
    if (value !== undefined) report.dropped.push({ key, value });
  }

  for (const rule of Object.values(map.keys)) {
    if (rule.copy) continue;
    for (const source of rule.from ?? []) remove(files, source);
  }
  for (const key of map.drop) remove(files, key);
  for (const [from, to] of Object.entries(map.moves ?? {})) {
    const block = get(files, from);
    if (block === undefined) continue;
    remove(files, from);
    merge(files, to, block);
  }
  for (const [from, to] of Object.entries(RENAMES)) {
    if (from === to || files[from] === undefined) continue;
    merge(files, `${to}:`, files[from]);
    delete files[from];
  }
  for (const [target, value] of Object.entries(values)) {
    set(files, target, value);
  }
  return { files, report };
}

/** Keys in the order the release's own demo files have them, so a migrated
 * file reads like the one it will be compared with. */
function orderedLike(value, template) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const known = Object.keys(template ?? {}).filter((key) => key in value);
  const rest = Object.keys(value).filter((key) => !known.includes(key));
  return Object.fromEntries(
    [...known, ...rest].map((key) => [
      key,
      orderedLike(value[key], template?.[key]),
    ]),
  );
}

/** Counting texts still written as `singular|plural`, which the release
 * refuses at boot (the same test as the schemas' `refuseCountForms`). */
function countForms(files) {
  const found = [];
  const walk = (value, where) => {
    if (typeof value === 'string') {
      if (value.includes('{count}') && value.includes('|')) found.push(where);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        walk(item, where.endsWith(':') ? `${where}${key}` : `${where}.${key}`);
      }
    }
  };
  for (const file of FILES.filter(isText)) walk(files[file], `${file}:`);
  return found;
}

/** Schema problems other than the counting texts. Only for `--check`: loads
 * the schemas from source, which needs the workspace's packages. */
async function validate(files) {
  const { loadTypeScript } = await import('./lib/generated-docs.mjs');
  const problems = [];
  for (const [file, [entry, name]] of Object.entries(SCHEMAS)) {
    const schema = (await loadTypeScript(entry))[name];
    const result = schema.safeParse(files[file] ?? {});
    for (const issue of result.success ? [] : result.error.issues) {
      if (/counting text has one form/.test(issue.message)) continue;
      problems.push(`${file}:${issue.path.join('.')}: ${issue.message}`);
    }
  }
  return problems;
}

function readDemoAt(ref) {
  const files = {};
  for (const file of SOURCE_FILES) {
    try {
      files[file] = JSON.parse(
        execFileSync('git', ['show', `${ref}:config/${file}`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      );
    } catch {
      // A file the release had not introduced yet.
    }
  }
  return files;
}

function readDir(dir, names) {
  const files = {};
  for (const file of names) {
    const path = join(dir, file);
    if (existsSync(path)) files[file] = JSON.parse(readFileSync(path, 'utf8'));
  }
  return files;
}

const quoted = (value) => JSON.stringify(value);
function section(title, lines) {
  if (lines.length === 0) return;
  console.log(`\n${title}`);
  for (const line of lines) console.log(`  ${line}`);
}

const original = check
  ? readDemoAt(map.from)
  : readDir(configDir, SOURCE_FILES);
const { files, report } = migrate(original);
// Run from a checkout, the release's demo config sits beside the tools.
const demo = readDir(join(HERE, '..', 'config'), FILES);
const moved = Object.entries(RENAMES).filter(
  ([from, to]) => from !== to && original[from] !== undefined,
);
for (const file of FILES) {
  if (files[file]) files[file] = orderedLike(files[file], demo[file]);
}

console.log(
  `migrate-config: ${map.from} → ${mapFile.replace(/.*\//, '').replace(/\.json$/, '')}, ` +
    (check ? `demo config at ${map.from}` : configDir),
);
section(
  'Moved files:',
  moved.map(([from, to]) => `${from} → ${to}`),
);
section(
  'New wording, written in English — translate it:',
  report.added
    .filter(({ file }) => isText(file))
    .map(({ target, value }) => `${target} = ${quoted(value)}`),
);
section(
  "New settings, set to the demo's value — decide them:",
  report.added
    .filter(({ file }) => !isText(file))
    .map(({ target, value }) => `${target} = ${quoted(value)}`),
);
section(
  'Merged keys whose values differed — the first was kept, check it reads right everywhere:',
  report.conflicts.flatMap(({ target, kept, others }) => [
    `${target} = ${quoted(kept.value)}  (from ${kept.source})`,
    ...others.map(
      ({ source, value }) => `    was ${quoted(value)} at ${source}`,
    ),
  ]),
);
section(
  'Dropped, no longer used:',
  report.dropped.map(({ key, value }) => `${key} = ${quoted(value)}`),
);
section(
  'Counting texts to reword without "|" (the deployment does not boot until then):',
  countForms(files),
);
section(
  'Missing from your files — the release requires them, so write them before deploying:',
  report.missing,
);

if (check) {
  // The demo was worded for this release by hand, so only a broken structure
  // fails here — never the wording reported above.
  const problems = await validate(files);
  section('Invalid after migration:', problems);
  if (problems.length + report.missing.length > 0) {
    console.error('\nThe map is incomplete.');
    process.exit(1);
  }
  console.log('\nThe map is complete.');
} else if (write) {
  const written = FILES.filter((file) => files[file]);
  for (const file of written) {
    mkdirSync(dirname(join(configDir, file)), { recursive: true });
    writeFileSync(
      join(configDir, file),
      `${JSON.stringify(files[file], null, 2)}\n`,
    );
  }
  for (const [from] of moved) rmSync(join(configDir, from));
  console.log(
    `\nWrote ${written.length} files to ${configDir}` +
      (moved.length ? ` and removed the ${moved.length} they replace.` : '.'),
  );
} else {
  console.log('\nNothing written. Pass --write to write the files.');
}
