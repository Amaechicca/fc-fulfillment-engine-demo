// Reads the raw connector reads in data/raw/ and writes:
//   data/snapshot.json          numbers, sources, alerts — no member or per-rep names (safe to commit)
//   data/snapshot.private.json  named lists (members, reps, task titles) — gitignored, loaded only if present
//
// Usage: node scripts/build-snapshot.mjs [--now 2026-11-03T21:30:00Z]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, SOURCES } from '../js/data/snapshot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'data', 'raw');

const nowArg = process.argv.indexOf('--now');
const nowMs = nowArg > -1 ? Date.parse(process.argv[nowArg + 1]) : Date.now();

const raws = {};
const files = await readdir(rawDir).catch(() => []);
for (const id of Object.keys(SOURCES)) {
  if (!files.includes(`${id}.json`)) { console.warn(`! ${id}: no raw read — will show as missing`); continue; }
  try {
    raws[id] = JSON.parse(await readFile(join(rawDir, `${id}.json`), 'utf8'));
  } catch (e) {
    console.warn(`! ${id}: could not parse (${e.message}) — will show as failed`);
    raws[id] = { readAt: null, complete: false, payload: null };
  }
}

const snap = buildSnapshot(raws, nowMs);
const { private: priv, ...pub } = snap;

await writeFile(join(root, 'data', 'snapshot.json'), JSON.stringify(pub, null, 1));
await writeFile(join(root, 'data', 'snapshot.private.json'), JSON.stringify({ builtAt: snap.builtAt, ...priv }, null, 1));

console.log(`snapshot built ${snap.builtAt}`);
for (const b of snap.buildings) console.log(`  ${b.status.padEnd(5)} ${b.name}`);
console.log(`  ${snap.alerts.length} alerts`);
