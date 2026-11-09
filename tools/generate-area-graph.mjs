#!/usr/bin/env node
/**
 * Draws the imports between areas into `docs/architecture.md`, counted from
 * the code with the same cut the boundary lint holds
 * (`tools/lint/area-boundaries.mjs`), so the picture cannot drift from the rule.
 *
 * An edge the table allows but no file uses is drawn dotted: a permission the
 * lint cannot see is unneeded. Specs and fixtures are left out, as they may
 * read across the cut to set a scene.
 *
 * Run `node tools/generate-area-graph.mjs` after moving code between areas or
 * changing the table. `--check` verifies the committed graph, which is what CI
 * runs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

import {
  formatted,
  injectSection,
  writeOrCheck,
} from './lib/generated-docs.mjs';
import { AREA_EDGES, FOLDERS, LAYERS } from './lint/area-boundaries.mjs';

const DOC = 'docs/architecture.md';
const COMMAND = 'tools/generate-area-graph.mjs';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SHARED = '@b2b-catalog-platform/shared/';

const LAYER_NAMES = {
  'apps/api/src': 'API',
  'libs/shared/src': 'contracts',
  'apps/web/src/app': 'web',
};

const AREAS = Object.keys(AREA_EDGES);

/** Longest folder first, so `admin/platform` wins over `platform`. */
const ELEMENTS = LAYERS.flatMap((layer) =>
  FOLDERS.map(({ folder, type }) => ({
    prefix: `${layer}/${folder}/`,
    type,
    layer,
  })),
).sort((a, b) => b.prefix.length - a.prefix.length);

/** The area a workspace path belongs to, `platform` for the area-free code,
 * or null outside the cut (roots, shells, the deployment entry). */
function areaOf(path) {
  const element = ELEMENTS.find(({ prefix }) => `${path}/`.startsWith(prefix));
  if (!element) return null;
  const [level, area] = element.type.split(':');
  if (level === 'platform' || area === 'platform') return 'platform';
  return AREAS.includes(area) ? area : null;
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (
      /\.ts$/.test(entry.name) &&
      !/\.(spec|fixture)\.ts$/.test(entry.name)
    ) {
      yield path;
    }
  }
}

/** Every module a file names: static, re-exported and lazy imports. */
function specifiers(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
  );
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function target(file, specifier) {
  if (specifier.startsWith('.')) {
    return relative(ROOT, resolve(dirname(file), specifier));
  }
  if (specifier.startsWith(SHARED)) {
    return `libs/shared/src/${specifier.slice(SHARED.length)}`;
  }
  return null;
}

/** `from>to` → { layer → importing files }. */
const edges = new Map();
for (const layer of LAYERS) {
  for (const absolute of sourceFiles(join(ROOT, layer))) {
    const file = relative(ROOT, absolute);
    const from = areaOf(file);
    if (!from) continue;
    for (const specifier of specifiers(absolute)) {
      const path = target(absolute, specifier);
      const to = path && areaOf(path);
      if (!to || to === from || to === 'platform') continue;
      const key = `${from}>${to}`;
      const files = edges.get(key) ?? new Map();
      edges.set(key, files);
      const layerFiles = files.get(layer) ?? new Set();
      files.set(layer, layerFiles);
      layerFiles.add(file);
    }
  }
}

const allowed = new Set(
  Object.entries(AREA_EDGES).flatMap(([from, tos]) =>
    tos.map((to) => `${from}>${to}`),
  ),
);
const keys = [...new Set([...allowed, ...edges.keys()])].sort((a, b) => {
  const rank = (key) =>
    key.split('>').map((area) => ['platform', ...AREAS].indexOf(area));
  const [a1, a2] = rank(a);
  const [b1, b2] = rank(b);
  return a1 - b1 || a2 - b2;
});

const count = (key, layer) => edges.get(key)?.get(layer)?.size ?? 0;
const total = (key) =>
  LAYERS.reduce((sum, layer) => sum + count(key, layer), 0);
function note(key) {
  if (!edges.has(key)) return 'allowed, unused';
  if (!allowed.has(key)) return 'not in the table';
  return '';
}

// The lint refuses these too; named here so a stale graph is not the only clue.
const strays = keys.filter((key) => note(key) === 'not in the table');
if (strays.length > 0) {
  console.error(`imports the table does not allow: ${strays.join(', ')}`);
  process.exit(1);
}

// Top-down, highest area first: the layout ranks nodes in the order it meets
// them, so this keeps the domain's layers as rows.
// toReversed, as the table below reads `keys` in order.
const lines = keys.toReversed().map((key) => {
  const [from, to] = key.split('>');
  if (!edges.has(key)) return `  ${from} -.-> ${to}`;
  return `  ${from} -->|${total(key)}| ${to}`;
});

const body = [
  '```mermaid',
  'flowchart TB',
  ...lines,
  '```',
  '',
  '| From | To | ' +
    LAYERS.map((layer) => LAYER_NAMES[layer]).join(' | ') +
    ' | Note |',
  '| --- | --- | ' + LAYERS.map(() => '---:').join(' | ') + ' | --- |',
  ...keys.map((key) => {
    const [from, to] = key.split('>');
    const counts = LAYERS.map((layer) => count(key, layer));
    return `| ${from} | ${to} | ${counts.join(' | ')} | ${note(key)} |`;
  }),
].join('\n');

const document = injectSection(readFileSync(DOC, 'utf8'), 'area-graph', body);
writeOrCheck({ [DOC]: formatted(document, 'markdown') }, COMMAND);
