// Runs every test/**/*.test.ts with Node's built-in runner. esbuild bundles each file first,
// because the sources use bundler-style `.js` imports of `.ts` files, which Node can't
// resolve on its own. No test framework dependency.

import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as esbuild from 'esbuild';

const OUT = '.test-dist';

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const only = process.argv.slice(2);
const tests = findTests('test').filter((path) => only.length === 0 || only.some((part) => path.includes(part)));
if (tests.length === 0) {
  console.error(`No tests match ${only.map((part) => `"${part}"`).join(' or ')}.`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
await esbuild.build({
  entryPoints: tests,
  outdir: OUT,
  outbase: 'test',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  loader: { '.pdf': 'binary' },
  define: { __BUILD_TIME__: '"test"', __DEV_TOOLS__: 'true' },
  logLevel: 'warning',
});

const built = tests.map((path) => join(OUT, relative('test', path)).replace(/\.ts$/, '.mjs'));
const result = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' });
process.exit(result.status ?? 1);
