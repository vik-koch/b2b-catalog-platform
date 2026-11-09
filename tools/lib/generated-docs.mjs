/** What every docs generator needs: loading the TypeScript it reads, and
 * writing so CI can verify. `--check` compares bytes, so generated files stay
 * out of Prettier's reach (.prettierignore). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const SHARED = '@b2b-catalog-platform/shared';

/** Mirrors the tsconfig paths: `shared/<entry>` is that folder's index. */
const sharedEntries = {
  name: 'shared-entries',
  setup(builder) {
    builder.onResolve(
      { filter: /^@b2b-catalog-platform\/shared\// },
      (args) => ({
        path: resolve(
          `libs/shared/src${args.path.slice(SHARED.length)}/index.ts`,
        ),
      }),
    );
  },
};

/**
 * Runs a TypeScript module in Node by bundling it first.
 *
 * The workspace aliases are resolved here rather than left external: esbuild
 * knows nothing about tsconfig paths, and a `@b2b-catalog-platform/shared/<entry>`
 * import would not resolve at import time. Everything from node_modules stays
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
      plugins: [sharedEntries],
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

/** Writes every file, or under `--check` fails on the first stale one,
 * naming the fixing command for whoever reads CI. */
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
