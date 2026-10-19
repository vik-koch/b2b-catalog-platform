#!/usr/bin/env node
/**
 * Asserts that every deployment this repo commits would boot and seed: the
 * test fixture (`config/` + `seed/`) and each `deployments/<name>/`.
 *
 * Only the fixture is loaded by the test suites, so a translated deployment
 * that misses a key a release added would otherwise first fail on its stack.
 * Each config directory is checked the way the apps load it at boot — every
 * file whole against its schema, and an `assets/` folder beside them — and
 * each seed bundle the way the seeder reads it.
 *
 * The file list repeats `SCHEMAS` in migrate-config.mjs, which has to stand
 * alone for operators. A JSON file no entry names fails here, so a new config
 * file cannot be left out of both.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadTypeScript } from './lib/generated-docs.mjs';

/** The config files, and the schema each is loaded with at boot. */
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

const deployments = [
  { name: 'test fixture', config: 'config', seed: 'seed' },
  ...(existsSync('deployments')
    ? readdirSync('deployments', { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => ({
          name,
          config: join('deployments', name, 'config'),
          seed: join('deployments', name, 'seed'),
        }))
    : []),
];

const schemas = {};
for (const [file, [entry, name]] of Object.entries(SCHEMAS)) {
  schemas[file] = (await loadTypeScript(entry))[name];
}
const { loadSeedBundle } = await loadTypeScript('libs/seed/src/index.ts');

function jsonFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith('.json'))
    .map((file) => relative(dir, join(dir, file)));
}

function configProblems(dir) {
  if (!existsSync(dir)) return [`${dir}: missing`];
  const problems = [];
  for (const [file, schema] of Object.entries(schemas)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      problems.push(`${path}: missing`);
      continue;
    }
    const result = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    for (const issue of result.success ? [] : result.error.issues) {
      problems.push(`${path}:${issue.path.join('.')}: ${issue.message}`);
    }
  }
  for (const file of jsonFiles(dir).filter((file) => !(file in schemas))) {
    problems.push(`${join(dir, file)}: no schema loads it`);
  }
  const assets = join(dir, 'assets');
  if (!existsSync(assets) || !statSync(assets).isDirectory()) {
    problems.push(`${assets}: missing`);
  }
  return problems;
}

function seedProblems(dir) {
  if (!existsSync(dir)) return [`${dir}: missing`];
  try {
    loadSeedBundle(dir);
    return [];
  } catch (error) {
    return [`${dir}: ${error.message}`];
  }
}

let failed = false;
for (const { name, config, seed } of deployments) {
  const problems = [...configProblems(config), ...seedProblems(seed)];
  if (problems.length === 0) {
    console.log(`check-deployments: ${name} ok`);
    continue;
  }
  failed = true;
  console.error(`check-deployments: ${name}`);
  for (const problem of problems) console.error(`  ${problem}`);
}
process.exit(failed ? 1 : 0);
