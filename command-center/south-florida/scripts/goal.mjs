#!/usr/bin/env node
// Read-only: prints South Florida renewal goal progress from the data module. Writes nothing.
// Usage: node scripts/goal.mjs [path/to/data.js]
//   default: data/sf-data.real.js when it exists locally (never committed), else the placeholder.
import { relative } from 'node:path';
import { loadDataFile, resolveDataFile } from './load-data.mjs';
import { renewalRace } from '../js/sf-model.js';

const file = resolveDataFile(process.argv[2]);
const d = loadDataFile(file);
const race = renewalRace(d.renewal);
if (!race) { console.log('No renewal data in the data file.'); process.exit(0); }
const pct = (v) => (v === null ? 'no decided renewals yet' : `${v}%`);
const date = (iso) => (iso ? `${new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'no date');
// A current period marked earlySample:true never gets an "Above the goal" verdict here: the rate is
// printed unchanged, but the verdict line is neutral until the period has more than an early sample.
const EARLY_NEUTRAL = 'Early sample - not a verdict on the 75% goal';
const verdictText = (p, isCurrent) => (isCurrent && p.earlySample && p.verdict.state === 'above' ? EARLY_NEUTRAL : p.verdict.text);
const row = (title, p, isCurrent = false) => [
  `${title}: ${pct(p.rate)}  (${p.renewed} of ${p.decided} decided · ${p.label}${p.earlySample ? ' · tiny early sample' : ''})`,
  `  Verdict: ${verdictText(p, isCurrent)}`,
  `  ${p.churned} churned${p.open !== undefined ? `, ${p.open} still open` : ''}`,
  `  Source: ${p.source} · as of ${date(p.asOf)}`,
];
const c = race.current;
const out = [
  'South Florida renewal goal',
  `Data file: ${relative(process.cwd(), file) || file}${d.placeholder ? '  ⚠ PLACEHOLDER SAMPLE DATA, not real numbers' : ''}`,
  '',
  `Goal: above ${race.target}% renewal rate (exactly ${race.target}% is not above).`,
  '',
  ...row('Current period (decided rate)', c, true),
  c.needToFinish === null ? '' : c.reachable
    ? `  To finish the period above ${race.target}%: renew ${c.needToFinish} of the ${c.open} still open.`
    : `  Even renewing all ${c.open} still open would not finish the period above ${race.target}%.`,
  '',
  ...row('Prior completed month', race.prior),
  '',
  'Rates come only from renewed vs churned counts. Message volume is never counted.',
];
console.log(out.join('\n').replace(/\n{3,}/g, '\n\n'));
