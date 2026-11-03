// Cross-system sources on SAMPLE data (synthetic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEngagement, normalizePipeline, normalizeSlack, normalizeJoins, normalizeFathom } from '../js/data/engagement.js';
import { judge } from '../js/data/rules.js';

const NOW = Date.parse('2026-11-03T21:00:00Z');
const env = (id, payload, extra = {}) => ({ __id: id, readAt: '2026-11-03T20:00:00Z', complete: true, payload, ...extra });

test('engagement: shares are of active members', () => {
  const e = normalizeEngagement(env('fcai_member_engagement', { active_members: 200, on_slack: 150, app_used_30d: 100, mastermind_seated: 50, avg_quality: 70, quality_scored: 190, revenue_verified: 20, app_events_30d: [] }));
  assert.equal(e.metrics.on_slack_pct.value, 75);
  assert.equal(e.metrics.app_used_30d_pct.value, 50);
  assert.equal(judge(e.metrics.app_used_30d_pct, 'app_used_30d_pct').status, 'amber');
});

test('pipeline: counts only interviews in scope; stale = no outcome 3+ full days later', () => {
  const p = normalizePipeline(env('fcai_pipeline_prospects', {
    summary: { matched_not_closed: 10, excluded_closed: 1, excluded_interview_not_taken: 2, window_start: '2026-10-01' },
    verdict_codes: { H: 'hot', N: 'not recorded' },
    rows: [
      { name: 'A', interview_date: '2026-11-03', verdict: 'N' }, // today: not stale
      { name: 'B', interview_date: '2026-10-30', verdict: 'N' }, // 3 days: stale
      { name: 'C', interview_date: '2026-10-30', verdict: 'H' },
      { name: 'D', interview_date: '2026-10-20', verdict: 'N' }, // before scope window
    ],
  }), NOW);
  assert.equal(p.metrics.outcome_missing_3d.value, 1);
  assert.equal(p.metrics.hot_not_closed.value, 1);
  assert.deepEqual(p.private.pipeline_no_outcome.map((r) => r.name), ['B']);
  assert.ok(!JSON.stringify(p.metrics).includes('"B"'));
});

test('slack: a cut-short read is marked incomplete and never judged', () => {
  const s = normalizeSlack(env('slack_channels', {
    rd_sos: { since: '2026-10-04', posts: 2, posts_without_reply: 1, latest_post: '2026-10-27' },
    member_support: { moved_off_slack_on: '2026-09-28' },
    welcome_intros: { since: '2026-10-27T00:00:00Z', top_level_posts_read: 32, complete: false },
  }));
  assert.equal(s.metrics.welcome_intros_7d.complete, false);
  assert.equal(judge(s.metrics.rd_sos_unanswered, 'rd_sos_unanswered').status, 'red');
  assert.equal(s.metrics.member_support_moved.value, null);
  assert.match(s.metrics.member_support_moved.missingReason, /Moved off Slack/);
});

test('joins: flags when the ledger and closer panel disagree', () => {
  const j = normalizeJoins(env('fcai_joins_by_month', { months: [{ month: '2026-10', new_members: 193 }, { month: '2026-11', new_members: 23 }] }), 197);
  assert.equal(j.metrics.joins_this_month.value, 23);
  assert.match(j.metrics.joins_last_month_ledger.note, /197/);
});

test('fathom: sums call types across days', () => {
  const f = normalizeFathom(env('fathom_calls', { window: { from: 'a', to: 'b' }, by_day: [
    { intro: 2, interview_or_sales_followup: 1, rd_checkin_or_followup: 1, onboarding: 0, internal: 1, other: 0 },
    { intro: 3, interview_or_sales_followup: 0, rd_checkin_or_followup: 2, onboarding: 1, internal: 0, other: 1 }] }));
  assert.equal(f.metrics.calls_intro_2d.value, 5);
  assert.equal(f.metrics.calls_rd_2d.value, 3);
});
