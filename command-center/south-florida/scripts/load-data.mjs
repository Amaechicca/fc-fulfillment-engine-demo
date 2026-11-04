// Reads a data module (a plain script that sets window.SF_DATA) without a browser.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
export const PLACEHOLDER = `${DATA_DIR}sf-data.js`;
export const REAL = `${DATA_DIR}sf-data.real.js`;

export function loadDataFile(path) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path, 'utf8'), sandbox, { filename: path, timeout: 2000 });
  if (!sandbox.window.SF_DATA) throw new Error(`${path} did not set window.SF_DATA`);
  // plain JSON round-trip: detaches the object from the sandbox realm
  return JSON.parse(JSON.stringify(sandbox.window.SF_DATA));
}

/** The real local file when it exists (never committed), otherwise the placeholder. */
export function resolveDataFile(explicit) {
  if (explicit) return explicit;
  return existsSync(REAL) ? REAL : PLACEHOLDER;
}
