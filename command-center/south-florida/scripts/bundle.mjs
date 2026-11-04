#!/usr/bin/env node
// Builds a self-contained publish folder at dist/ (gitignored) with REAL data in place of the
// placeholder. Nothing is uploaded or hosted: publishing is a separate, manual step.
// Usage: node scripts/bundle.mjs [path/to/sf-data.real.js]
import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDataFile, REAL } from './load-data.mjs';
import { validateData } from '../js/sf-model.js';

const here = fileURLToPath(new URL('..', import.meta.url));
const cc = fileURLToPath(new URL('../../', import.meta.url));
const real = process.argv[2] || REAL;
if (!existsSync(real)) { console.error(`No real data file at ${real}. Nothing built.`); process.exit(1); }
const data = loadDataFile(real);
const errs = validateData(data);
if (errs.length) { console.error('Real data failed the schema check:\n- ' + errs.join('\n- ')); process.exit(1); }
if (data.placeholder !== false) { console.error('Real data must set placeholder: false.'); process.exit(1); }

// dist/ mirrors the command-center layout so the page's relative paths still resolve:
// dist/styles.css, dist/js/data/format.js, dist/vendor/ (shared) and dist/south-florida/ (this page)
const out = `${here}dist/`;
const page = `${out}south-florida/`;
rmSync(out, { recursive: true, force: true });
mkdirSync(`${page}data`, { recursive: true });
mkdirSync(`${out}js/data`, { recursive: true });
for (const f of ['index.html', 'sf.css', 'js']) cpSync(`${here}${f}`, `${page}${f}`, { recursive: true });
copyFileSync(real, `${page}data/sf-data.js`);
cpSync(`${cc}styles.css`, `${out}styles.css`);
cpSync(`${cc}js/data/format.js`, `${out}js/data/format.js`);
cpSync(`${cc}vendor`, `${out}vendor`, { recursive: true });
console.log(`Built ${page} with real data (${data.items?.length ?? 0} item rows). It is gitignored; do not commit it.`);
