#!/usr/bin/env node
/**
 * Asserts that every deployment this repo commits would boot and seed: each
 * `deployments/<name>/`, the test fixture included.
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
 *
 * `--config-dir <dir>` checks one config directory instead, with no seed
 * bundle: a real deployment's, kept outside this repo.
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

const at = process.argv.indexOf('--config-dir');
const configDir = at >= 0 ? process.argv[at + 1] : undefined;
const deployments = configDir
  ? [{ name: configDir, config: configDir, seed: undefined }]
  : readdirSync('deployments', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => ({
        name,
        config: join('deployments', name, 'config'),
        seed: join('deployments', name, 'seed'),
      }));

const schemas = {};
for (const [file, [entry, name]] of Object.entries(SCHEMAS)) {
  schemas[file] = (await loadTypeScript(entry))[name];
}
const { loadSeedBundle } = await loadTypeScript('libs/seed/src/index.ts');
// A bundle may describe its simulated back office; the simulator reads it
// strictly at boot, which on the stack is after the shop has been reset.
const { simulationSchema } = await loadTypeScript(
  'apps/erp-sim/src/simulation.ts',
);

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
  const problems = [];
  try {
    loadSeedBundle(dir);
  } catch (error) {
    problems.push(`${dir}: ${error.message}`);
  }
  const simulation = join(dir, 'simulation.json');
  if (existsSync(simulation)) {
    const result = simulationSchema.safeParse(
      JSON.parse(readFileSync(simulation, 'utf8')),
    );
    for (const issue of result.success ? [] : result.error.issues) {
      problems.push(`${simulation}:${issue.path.join('.')}: ${issue.message}`);
    }
  }
  return problems;
}

let failed = false;
for (const { name, config, seed } of deployments) {
  const problems = [
    ...configProblems(config),
    ...(seed ? seedProblems(seed) : []),
  ];
  if (problems.length === 0) {
    console.log(`check-deployments: ${name} ok`);
    continue;
  }
  failed = true;
  console.error(`check-deployments: ${name}`);
  for (const problem of problems) console.error(`  ${problem}`);
}
process.exit(failed ? 1 : 0);
