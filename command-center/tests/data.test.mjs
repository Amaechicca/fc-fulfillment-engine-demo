// Data-layer tests on SAMPLE data (synthetic, not FC numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, worst } from '../js/data/rules.js';
import { buildSnapshot, normalizeTasks, normalizeEvents } from '../js/data/snapshot.js';

const NOW = Date.parse('2026-01-15T12:00:00Z');
const READ = '2026-01-15T11:00:00Z';
const env = (payload, extra = {}) => ({ readAt: READ, complete: true, payload, ...extra });

const sample = {
  fcai_community_pulse: env({ active_members: 100, by_sales_territory: { A: 60, B: 40 }, industry_top10: { saas: 10 } }),
  fcai_renewal_diagnosis: env({
    summary: {
      window: { from: '2026-01-01', to: '2026-01-31' }, book_count: 50,
      renewed: { count: 30, usd: 30000 }, policy_exits: { count: 1, usd: 1000 },
      voluntary_churn: { count: 5, usd: 5000 }, silent_churn: { count: 3, usd: 3000 },
      payment_failures: { count: 1, usd: 1000 }, other_exits: { count: 0, usd: 0 },
      open: { worth_a_call: 2, quiet: 8, usd: 10000 }, voluntary_rate_pct: 76.9,
    },
    columns: {
      open_worth_a_call: [{ name: 'Sample A', plan_value_usd: 1500 }, { name: 'Sample B', plan_value_usd: 500 }],
      silent_churn: [{ name: 'Sample C', plan_value_usd: 1000 }],
    },
  }),
  fcai_rd_book_risk: env({ since: '2025-11-15', leaving: [{ name: 'X', territory: 'T1', frustrated: true }], undecided: [{ name: 'Y', territory: 'T1' }] }),
  fcai_staff_closer: env({ window: { from: '2026-01-01', to: '2026-01-15' }, team_size: 2,
    team_medians: { occurred_to_close_rate: 22, interview_show_rate: 60, cash_per_interview_occurred_usd: 900 },
    rows: [{ name: 'C1', deals_closed_total: 3, total_closer_revenue_cents: 3000 }, { name: 'C2', deals_closed_total: 2, total_closer_revenue_cents: 2000 }] }),
  fcai_staff_setter: env({ window: { from: '2026-01-01', to: '2026-01-15' }, team_size: 2,
    team_medians: { intro_show_rate: 40, intro_to_close_rate: 5, on_call_dq_rate: 20, cash_per_intro_usd: 100 },
    rows: [{ name: 'S1', intros_scheduled: 50, intro_show_rate: 30 }, { name: 'S2', intros_scheduled: 10, intro_show_rate: 20 }] }),
  fcai_admissions: env({ calls: 100, outcomes: { joined_or_committed: 35, booked_next_step: 40, thinking_about_it: 20, declined: 3, no_prospect_engagement: 2 },
    objections_raised: { price: 10, travel_format: 30 } }, { args: { from: '2026-01-01', to: '2026-01-15' } }),
  fcai_attribution: env({ window: { start: '2026-01-01', end: '2026-01-15' },
    rows: [{ channel: 'paid', person: 'facebook', bookings_last: 80, closes_last: 4, cost_usd: 4000 }, { channel: 'unknown', person: null, bookings_last: 20, closes_last: 1, cost_usd: null }],
    coverage: { intro_bookings: 100, last_touch_unknown: 20 } }),
  fcai_event_feedback: env({ total_responses: 10, aggregates: [{ city: 'C', kind: 'Social', responses: 10, avg_score: 9, promoters: 7, detractors: 1 }] }, { args: { since: '2026-01-01' } }),
  clickup_tasks: env({ tasks: [
    { id: '1', name: 'late urgent', list: 'Admissions', status: 'to do', priority: 'urgent', due_ms: NOW - 3 * 86400000, assignees: ['Ann'], url: 'u1' },
    { id: '2', name: 'late paused', list: 'Admissions', status: 'on pause', priority: null, due_ms: NOW - 86400000, assignees: ['Ann'], url: 'u2' },
    { id: '3', name: 'future', list: 'Admissions', status: 'in progress', priority: null, due_ms: NOW + 86400000, assignees: ['Bob'], url: 'u3' },
    { id: '4', name: 'idea', list: 'Operations', status: 'ideas', priority: null, due_ms: NOW - 86400000, assignees: [], url: 'u4' },
  ] }),
};

test('judge: higher-is-better thresholds', () => {
  assert.equal(judge({ value: 25, complete: true }, 'closer_close_rate').status, 'green');
  assert.equal(judge({ value: 17, complete: true }, 'closer_close_rate').status, 'amber');
  assert.equal(judge({ value: 10, complete: true }, 'closer_close_rate').status, 'red');
});

test('judge: lower-is-better thresholds', () => {
  assert.equal(judge({ value: 2, complete: true }, 'overdue_tasks').status, 'green');
  assert.equal(judge({ value: 5, complete: true }, 'overdue_tasks').status, 'amber');
  assert.equal(judge({ value: 6, complete: true }, 'overdue_tasks').status, 'red');
});

test('judge: missing or incomplete data is grey, never judged', () => {
  assert.equal(judge({ value: null }, 'event_nps').status, 'grey');
  assert.equal(judge(undefined, 'event_nps').status, 'grey');
  const r = judge({ value: 99, complete: false }, 'event_nps');
  assert.equal(r.status, 'grey');
  assert.match(r.reason, /incomplete/);
});

test('judge: too small a sample is grey', () => {
  assert.equal(judge({ value: 10, complete: true, sample: 5 }, 'renewals_voluntary_rate').status, 'grey');
  assert.equal(judge({ value: 10, complete: true, sample: 40 }, 'renewals_voluntary_rate').status, 'red');
});

test('worst picks the most severe, ignores grey unless all grey', () => {
  assert.equal(worst(['green', 'amber', 'grey']), 'amber');
  assert.equal(worst(['grey', 'grey']), 'grey');
  assert.equal(worst(['green', 'red', 'amber']), 'red');
});

test('tasks: overdue counts only open tasks, urgent flagged', () => {
  const t = normalizeTasks(sample.clickup_tasks, NOW);
  assert.equal(t.byList.Admissions.overdue, 1);
  assert.equal(t.byList.Admissions.overdue_urgent, 1);
  assert.equal(t.byList.Admissions.on_pause, 1);
  assert.equal(t.byList.Admissions.topAssignee, 'Ann');
  assert.equal(t.byList.Operations.overdue, 0);
  assert.equal(t.private.Admissions[0].days_late, 3);
});

test('events: NPS from promoters/detractors, incomplete if totals disagree', () => {
  const e = normalizeEvents({ ...sample.fcai_event_feedback, __id: 'fcai_event_feedback' });
  assert.equal(e.metrics.event_nps.value, 60);
  assert.equal(e.metrics.event_nps.complete, true);
  const bad = { ...sample.fcai_event_feedback, payload: { ...sample.fcai_event_feedback.payload, total_responses: 99 } };
  assert.equal(normalizeEvents(bad).metrics.event_nps.complete, false);
});

test('snapshot: every metric carries source, read time and scope', () => {
  const s = buildSnapshot(sample, NOW);
  for (const b of s.buildings) for (const m of b.metrics) {
    if (m.value === null) { assert.ok(m.missingReason, `${m.id} missing without reason`); continue; }
    assert.ok(m.source, `${m.id} has no source`);
    assert.ok(m.readAt, `${m.id} has no readAt`);
    assert.ok(m.scope, `${m.id} has no scope`);
  }
});

test('snapshot: sums and shares computed from the raw read', () => {
  const s = buildSnapshot(sample, NOW);
  const top = Object.fromEntries(s.topNumbers.map((m) => [m.id, m.value]));
  assert.equal(top.active_members, 100);
  assert.equal(top.new_members_closed, 5);
  assert.equal(top.new_member_cash_usd, 5000);
  const mk = s.buildings.find((b) => b.id === 'marketing').metrics.find((m) => m.id === 'unknown_source_share');
  assert.equal(mk.value, 20);
  const fb = s.buildings.find((b) => b.id === 'marketing').metrics.find((m) => m.id === 'fb_cost_per_close');
  assert.equal(fb.value, 1000);
});

test('snapshot: building statuses follow the rules', () => {
  const s = buildSnapshot(sample, NOW);
  const st = Object.fromEntries(s.buildings.map((b) => [b.id, b.status]));
  assert.equal(st.renewals, 'amber'); // 76.9% green, but 1 payment failure = amber
  assert.equal(st.setters, 'red'); // 40% show
  assert.equal(st.admissions, 'red'); // 1 overdue urgent task
  assert.equal(st.events, 'green');
  assert.equal(st.cash, 'grey'); // no source
});

test('snapshot: a source that was not read shows grey and is listed as failed', () => {
  const { fcai_staff_setter, ...rest } = sample;
  const s = buildSnapshot(rest, NOW);
  assert.equal(s.buildings.find((b) => b.id === 'setters').checks[0].status, 'grey');
  const src = s.sources.find((x) => x.id === 'fcai_staff_setter');
  assert.equal(src.ok, false);
  assert.equal(src.error, 'Not read');
});

test('snapshot: alerts are red before amber, then by dollars at stake', () => {
  const s = buildSnapshot(sample, NOW);
  const order = { red: 2, amber: 1 };
  for (let i = 1; i < s.alerts.length; i++) {
    const a = s.alerts[i - 1], b = s.alerts[i];
    assert.ok(order[a.status] >= order[b.status]);
    if (a.status === b.status) assert.ok((a.costUsd ?? -1) >= (b.costUsd ?? -1));
  }
  for (const a of s.alerts) { assert.ok(a.owner); assert.ok(a.nextStep); }
});

test('snapshot: public part carries no names', () => {
  const s = buildSnapshot(sample, NOW);
  const { private: priv, ...pub } = s;
  const txt = JSON.stringify(pub);
  for (const n of ['Sample A', 'Sample B', 'Sample C', 'late urgent', 'C1', 'S1']) assert.ok(!txt.includes(n), `${n} leaked into public snapshot`);
  assert.equal(priv.renewals_worth_call.length, 2);
});
