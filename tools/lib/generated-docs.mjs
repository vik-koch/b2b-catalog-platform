/**
 * The parts every documentation generator here needs: loading TypeScript the
 * docs are generated *from*, and writing the result in a way CI can verify.
 *
 * Generated documentation is only worth having if it cannot drift, so every
 * generator supports `--check` and CI runs it. The check compares bytes, which
 * is why the generated files are kept out of Prettier's reach (.prettierignore)
 * — a formatter rewriting them would make the check fail on formatting.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Runs a TypeScript module in Node by bundling it first.
 *
 * The workspace aliases are resolved here rather than left external: esbuild
 * knows nothing about tsconfig paths, and a bare `@b2b-catalog-platform/shared`
 * would not resolve at import time. Everything from node_modules stays
 * external, exactly as `generate-contract-routes.mjs` does it.
 */
export async function loadTypeScript(entryPoint) {
  // Inside the workspace, not the system temp dir: the bundle leaves its
  // dependencies external, so it has to sit where node_modules resolves.
  const outfile = `node_modules/.generated-docs-${Date.now()}.mjs`;
  try {
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      packages: 'external',
      alias: {
        '@b2b-catalog-platform/shared': './libs/shared/src/index.ts',
        '@b2b-catalog-platform/shared/node': './libs/shared/src/node/index.ts',
      },
      logLevel: 'silent',
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(outfile, { force: true });
  }
}

/**
 * Runs the workspace formatter over generated text, so a generated file is
 * byte-identical to what `prettier --check` would leave behind. Without it the
 * two checks contradict each other: the formatter rewrites the file and the
 * generator's own check then calls it stale.
 */
export function formatted(content, parser) {
  return execFileSync('npx', ['prettier', '--parser', parser], {
    input: content,
    encoding: 'utf8',
  });
}

/** The body of one generated section, between markers a person may edit around. */
export function injectSection(document, marker, body) {
  const open = `<!-- generated:${marker} -->`;
  const close = `<!-- /generated:${marker} -->`;
  const start = document.indexOf(open);
  const end = document.indexOf(close);
  if (start < 0 || end < 0) {
    throw new Error(`missing ${open} … ${close} markers`);
  }
  return `${document.slice(0, start + open.length)}\n${body}\n${document.slice(end)}`;
}

/**
 * Writes every file, or — under `--check` — reports the first one that is out
 * of date and fails. One message names the command that fixes it, because the
 * person reading it in CI did not run the generator and may not know it exists.
 */
export function writeOrCheck(files, command) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [path, content] of Object.entries(files)) {
    if (check) {
      let current = null;
      try {
        current = readFileSync(path, 'utf8');
      } catch {
        current = null;
      }
      if (current !== content) stale.push(path);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  const count = Object.keys(files).length;
  if (!check) {
    console.log(`${command}: wrote ${count} file${count === 1 ? '' : 's'}.`);
    return;
  }
  if (stale.length > 0) {
    console.error(
      `out of date — run \`node ${command}\`:\n${stale.map((path) => `  ${path}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log(`${command}: up to date (${count} files).`);
}
