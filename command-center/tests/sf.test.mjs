// South Florida Command Center: rules tested on the committed PLACEHOLDER data and synthetic rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDataFile, PLACEHOLDER } from '../south-florida/scripts/load-data.mjs';
import {
  sourceHealth, healthText, coverageWarning, dedupeItems, decidedRate, renewalRace, goalVerdict, queueStatus,
  eventSuggestions, splitBookings, memberAliases, validateData, actionPayload, sendBlocker,
} from '../south-florida/js/sf-model.js';

const NOW = Date.parse('2026-11-04T15:00:00Z');
const data = loadDataFile(PLACEHOLDER);
const sha = (s) => `sha256:${createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16)}`;

test('placeholder data is valid, marked as placeholder and obviously fake', () => {
  assert.deepEqual(validateData(data), []);
  assert.equal(data.placeholder, true);
  for (const it of data.items) assert.match(it.member, /^Example (Member|Guest) \d+$/);
  for (const b of data.bookings) assert.match(b.member, /^Example Member \d+$/);
  for (const f of data.events.feedback) assert.match(f.member, /^Example (Member|Guest) \d+$/);
});

test('real-data file patterns are gitignored', () => {
  const gi = readFileSync(new URL('../south-florida/.gitignore', import.meta.url), 'utf8');
  for (const p of ['data/sf-data.real.js', 'dist/']) assert.ok(gi.includes(p), p);
});

test('health: a past success is only "last verified", never online; no age rule', () => {
  const s = (check, extra = {}) => ({ id: 'x', check, ...extra });
  const ok = sourceHealth(s({ ranAt: '2026-11-04T14:00:00Z', live: true, succeeded: true }));
  assert.equal(ok.state, 'verified');
  assert.equal(healthText(ok), 'Last verified reachable 2026-11-04T14:00:00Z');
  const old = sourceHealth(s({ ranAt: '2025-01-01T00:00:00Z', live: true, succeeded: true }));
  assert.equal(old.state, 'verified'); // age neither upgrades nor downgrades it
  assert.equal(sourceHealth(s({ ranAt: '2026-11-04T14:00:00Z', live: false, succeeded: true })).state, 'unknown');
  assert.equal(sourceHealth(s({ ranAt: null, live: true, succeeded: true })).state, 'unknown');
  const off = sourceHealth(s({ ranAt: '2026-11-04T14:00:00Z', live: true, succeeded: false }));
  assert.equal(healthText(off), 'Offline (check failed at 2026-11-04T14:00:00Z)');
  assert.equal(sourceHealth(s({ ranAt: '2026-11-04T14:00:00Z', live: true, succeeded: true, axes: { reachable: false } })).state, 'offline');
  assert.equal(healthText(sourceHealth(s({ ranAt: '2026-11-04T14:00:00Z', live: true, succeeded: null }))), 'Status unknown');
  assert.equal(sourceHealth(s({}, { future: true })).state, 'not-connected');
  for (const src of data.sources) assert.ok(!/online/i.test(healthText(sourceHealth(src))), src.id);
  const byId = (id) => healthText(sourceHealth(data.sources.find((x) => x.id === id)));
  assert.equal(byId('ghl'), 'Signed in; content unreadable');
  assert.equal(byId('whatsapp'), 'Status unknown');
  assert.equal(byId('fathom'), 'Status unknown');
  assert.match(byId('gmail'), /^Last verified reachable /);
  assert.match(byId('slack'), /^Offline \(check failed at /);
  // GHL never reads as plainly verified, even if its axes say content is readable
  assert.equal(sourceHealth({ id: 'ghl', check: { ranAt: '2026-11-04T14:00:00Z', live: true, succeeded: true } }).state, 'content-blocked');
});

test('GHL always carries the content coverage warning', () => {
  assert.match(coverageWarning({ id: 'ghl', coverage: { complete: true } }), /content coverage incomplete/i);
  assert.match(coverageWarning(data.sources.find((x) => x.id === 'ghl')), /content coverage incomplete/i);
  assert.equal(coverageWarning({ id: 'gmail', coverage: { complete: true } }), null);
});

test('the same issue in several sources becomes one item', () => {
  const items = dedupeItems(data.items);
  const r = items.filter((i) => i.member === 'Example Member 12' && i.queue === 'at_risk');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].sources.map((s) => s.source).sort(), ['fathom', 'ghl', 'slack']);
  assert.equal(r[0].severity, 'high');
  assert.equal(r[0].asOf, '2026-11-04T14:10:00Z');
  const m2 = items.filter((i) => i.member === 'Example Member 2');
  assert.equal(m2.length, 1);
  assert.equal(m2[0].draft_id, 'r-EXAMPLE-DRAFT-002'); // message payload comes from the row that has the draft
  assert.equal(items.length, data.items.length - 3);
});

test('decided rate uses only renewed vs churned; message volume never moves it', () => {
  assert.equal(decidedRate(3, 1), 75);
  assert.equal(decidedRate(0, 0), null);
  const base = { target: 75, current: { renewed: 30, churned: 5, open: 4, label: 'x', source: 's', asOf: '2026-11-04T00:00:00Z' }, prior: { renewed: 17, churned: 7, label: 'y', source: 's', asOf: '2026-11-01T00:00:00Z' } };
  const noisy = structuredClone(base); noisy.current.messagesSent = 900; noisy.current.messages = 5000; noisy.prior.messagesSent = 1;
  assert.deepEqual(renewalRace(noisy).current.rate, renewalRace(base).current.rate);
  assert.deepEqual(renewalRace(noisy).prior.rate, renewalRace(base).prior.rate);
});

test('goal is strictly ABOVE 75%, with no minimum sample; earlySample is a label only', () => {
  assert.equal(goalVerdict(75, 75).state, 'close'); // exactly 75 is not above
  assert.equal(goalVerdict(75.1, 75).state, 'above');
  assert.equal(goalVerdict(100, 75).state, 'above'); // 2 of 2 is shown and judged as it is
  assert.equal(goalVerdict(null, 75).state, 'none');
  const tiny = { target: 75, current: { renewed: 2, churned: 0, open: 30, earlySample: true, label: 'MTD', source: 's', asOf: '2026-11-02T00:00:00Z' }, prior: { renewed: 17, churned: 7, label: 'Oct', source: 's', asOf: '2026-11-01T00:00:00Z' } };
  const plain = structuredClone(tiny); delete plain.current.earlySample;
  const a = renewalRace(tiny), b = renewalRace(plain);
  assert.equal(a.current.rate, 100);
  assert.equal(a.current.decided, 2);
  assert.equal(a.current.verdict.state, 'above');
  assert.equal(a.current.earlySample, true);
  assert.deepEqual({ ...a.current, earlySample: false }, b.current); // the label changes nothing else
  assert.equal(a.status, b.status);
  const race = renewalRace(data.renewal);
  assert.equal(race.current.rate, 69.2);
  assert.equal(race.current.decided, 13);
  assert.equal(race.current.verdict.state, 'below');
  assert.equal(race.prior.rate, 70.8);
  assert.equal(race.prior.decided, 24);
  // to finish above 75%: (9 + x) / 27 > 0.75 → x ≥ 12
  assert.equal(race.current.needToFinish, 12);
  assert.equal(race.current.reachable, true);
});

test('queue colours', () => {
  const items = dedupeItems(data.items);
  assert.equal(queueStatus('to_send', items, NOW), 'red'); // a bounced message
  assert.equal(queueStatus('at_risk', items, NOW), 'red');
  assert.equal(queueStatus('pending', items, NOW), 'amber'); // one sent 5 days ago
  assert.equal(queueStatus('new_members', items, NOW), 'amber');
  assert.equal(queueStatus('to_send', [], NOW), 'green');
});

test('message payload, version hashes and the held rule', () => {
  for (const it of data.items.filter((i) => i.draft_id)) {
    assert.equal(it.version, sha(it.body), `${it.id} version`);
    assert.equal(it.dedup_key, `${it.draft_id}:${it.version}`);
  }
  const it = dedupeItems(data.items).find((i) => i.draft_id === 'r-EXAMPLE-DRAFT-001');
  assert.deepEqual(Object.keys(actionPayload(it)).sort(), ['account', 'body', 'dedup_key', 'draft_id', 'recipient', 'thread_id', 'version']);
  assert.equal(actionPayload(it, 'edited').body, 'edited');
  assert.equal(sendBlocker(it, true), null);
  assert.match(sendBlocker(it, false), /does not match/);
  const held = dedupeItems(data.items).find((i) => i.state === 'held');
  assert.match(sendBlocker(held, true), /^Held: Photo release/);
  assert.match(sendBlocker({ ...it, state: 'sent' }, true), /Already sent/);
  const bad = structuredClone(data); bad.items.find((i) => i.state === 'held').hold_reason = '';
  assert.ok(validateData(bad).some((e) => /hold_reason/.test(e)));
});

test('event suggestions come only from clusters of distinct verified members; the threshold is configurable', () => {
  const r = eventSuggestions(data.events, NOW);
  assert.deepEqual(r.config, { minMembers: 3, windowDays: 60 });
  assert.equal(r.suggestions.length, 1);
  const s = r.suggestions[0];
  assert.equal(s.theme, 'hiring');
  assert.equal(s.evidence.distinctVerifiedMembers, 4); // member 15 mentioned it twice: counted once
  assert.equal(s.kind, 'missing');
  assert.deepEqual(s.evidence.channels.sort(), ['fathom', 'gmail', 'slack', 'whatsapp']);
  // 1-2 members: an early signal with evidence, never a suggestion
  assert.deepEqual(r.early.map((e) => [e.theme, e.evidence.distinctVerifiedMembers]), [['family-office', 2]]);
  // no feedback → nothing at all
  const empty = structuredClone(data.events); empty.feedback = [];
  assert.deepEqual([eventSuggestions(empty, NOW).suggestions, eventSuggestions(empty, NOW).early], [[], []]);
  // unverified mentions never count
  const unv = structuredClone(data.events); unv.feedback.forEach((f) => { f.verified = false; });
  assert.equal(eventSuggestions(unv, NOW).suggestions.length + eventSuggestions(unv, NOW).early.length, 0);
  // configurable in the data file
  const loose = structuredClone(data.events); loose.cluster = { minMembers: 2, windowDays: 60 };
  assert.deepEqual(eventSuggestions(loose, NOW).suggestions.map((x) => x.theme).sort(), ['family-office', 'hiring']);
  const tight = structuredClone(data.events); tight.cluster = { minMembers: 5, windowDays: 60 };
  assert.equal(eventSuggestions(tight, NOW).suggestions.length, 0);
  // old mentions fall out of the window
  assert.equal(eventSuggestions(data.events, Date.parse('2027-03-01T00:00:00Z')).suggestions.length, 0);
});

test('RD and club events stay separate tracks', () => {
  const bad = structuredClone(data); bad.events.club.push({ ...bad.events.rd[0] });
  assert.ok(validateData(bad).some((e) => /both the RD and club/.test(e)));
});

test('bookings split into upcoming and recent', () => {
  const { upcoming, recent } = splitBookings(data.bookings, NOW);
  assert.deepEqual(upcoming.map((b) => b.id), ['b5', 'b3', 'b4']);
  assert.deepEqual(recent.map((b) => b.id), ['b2', 'b1']);
});

test('hide-names aliases are stable', () => {
  const m = memberAliases(['A', 'B', 'A', 'C']);
  assert.deepEqual([...m.values()], ['Member A', 'Member B', 'Member C']);
});
