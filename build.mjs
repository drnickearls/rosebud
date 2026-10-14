import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { makeManifest, VERSION } from './extension-manifest.mjs';

const watch = process.argv.includes('--watch');
const OUT = 'dist/extension';

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'iife',
  target: 'es2022',
  charset: 'ascii', // an ASCII-only bundle cannot be misdecoded anywhere it travels
  legalComments: 'none',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: false, // the script people install stays readable, and DOM drift stays diagnosable
  loader: { '.pdf': 'binary' }, // the blank Routing Form ships inside the scripts
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()), __VERSION__: JSON.stringify(VERSION) },
};

const builds = [
  { entry: 'src/main.tsx', out: 'page.js' }, // MAIN world: the button and the print
  { entry: 'src/extension/bridge.ts', out: 'bridge.js' }, // ISOLATED world: hands over the saved form
  { entry: 'src/extension/background.ts', out: 'background.js' }, // service worker: toolbar button
  // The settings page. pdf.js (its minified build) draws the blank form; its worker is copied below.
  { entry: 'src/options/main.tsx', out: 'options.js', alias: { 'pdfjs-dist': 'pdfjs-dist/build/pdf.min.mjs' } },
].map(({ entry, out, alias }) => ({ ...common, entryPoints: [entry], outfile: `${OUT}/${out}`, ...(alias ? { alias } : {}) }));

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/icons`, { recursive: true });
await writeFile(`${OUT}/manifest.json`, JSON.stringify(makeManifest(), null, 2) + '\n');
await writeFile(
  `${OUT}/options.html`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rosebud form settings</title>
<link rel="stylesheet" href="options.css">
</head>
<body>
<div id="app"></div>
<script src="options.js"></script>
</body>
</html>
`,
);
await copyFile('src/options/options.css', `${OUT}/options.css`);
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${OUT}/pdf.worker.min.mjs`);
for (const file of await readdir('src/icons')) await copyFile(`src/icons/${file}`, `${OUT}/icons/${file}`);

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
  console.log('watching src/ ...');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  console.log(`built ${OUT} (v${VERSION}): ${builds.map((b) => b.outfile.split('/').pop()).join(', ')}, options.html, manifest.json`);
}
