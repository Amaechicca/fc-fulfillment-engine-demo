// Normalizers for the cross-system sources: member engagement and pulse (FC AI over GHL, Slack, the app),
// joins by month (membership ledger), the open interview pipeline (GHL outcomes via FC AI),
// recorded calls (Fathom) and Slack channels. Same contract as snapshot.js: numbers out, names to `private`.
import { metric, pct } from './metric.js';

export function normalizeEngagement(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const scope = 'Active members today';
  const share = (n) => pct(n, p.active_members);
  return {
    metrics: {
      on_slack_pct: metric('on_slack_pct', 'Active members on Slack', share(p.on_slack), raw, { unit: '%', scope, context: `${p.on_slack.toLocaleString('en-US')} of ${p.active_members.toLocaleString('en-US')}` }),
      app_used_30d_pct: metric('app_used_30d_pct', 'Used the app in 30 days', share(p.app_used_30d), raw, { unit: '%', scope: `${scope}; registered for an event, read an announcement, watched or downloaded, last 30 days`, context: `${p.app_used_30d.toLocaleString('en-US')} members` }),
      mastermind_seated_pct: metric('mastermind_seated_pct', 'In a mastermind group', share(p.mastermind_seated), raw, { unit: '%', scope: `${scope}; active seat`, context: `${p.mastermind_seated.toLocaleString('en-US')} members` }),
      engagement_score: metric('engagement_score', 'Average engagement score', p.avg_quality, raw, { unit: 'pts', scope: `${p.quality_scored.toLocaleString('en-US')} scored members; 0–100 from what we can observe` }),
      revenue_verified_pct: metric('revenue_verified_pct', 'Members with verified revenue', share(p.revenue_verified), raw, { unit: '%', scope, note: 'The rest is self-reported.' }),
    },
    tables: {
      app_events: p.app_events_30d.map((e) => ({ action: e.event_type.replace(/_/g, ' '), members: e.members, events: e.events })),
    },
  };
}

export function normalizePulse(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const by = Object.fromEntries(p.pulse.map((r) => [r.pulse, r.members]));
  const scope = 'Active members with a pulse read; weekly analysis of what they say in Slack and support';
  return {
    metrics: {
      pulse_frustrated: metric('pulse_frustrated', 'Frustrated (in their own words)', by.frustrated ?? 0, raw, { unit: 'members', scope }),
      pulse_disengaging: metric('pulse_disengaging', 'Disengaging', by.disengaging ?? 0, raw, { unit: 'members', scope }),
      pulse_thriving: metric('pulse_thriving', 'Thriving', by.thriving ?? 0, raw, { unit: 'members', scope }),
    },
    tables: {
      pulse: ['thriving', 'neutral', 'disengaging', 'frustrated'].map((k) => ({ pulse: k, members: by[k] ?? 0 })),
    },
  };
}

export function normalizeJoins(raw, closerDeals) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const oct = p.months.find((m) => m.month === '2026-10');
  const last = p.months[p.months.length - 1];
  const prior = p.months.slice(-7, -1);
  const avg = prior.length ? Math.round(prior.reduce((a, m) => a + m.new_members, 0) / prior.length) : null;
  return {
    metrics: {
      joins_this_month: metric('joins_this_month', 'New members so far this month', last?.new_members, raw, { unit: 'members', scope: `${last?.month}, first payment dated in the month (membership ledger)`, context: avg ? `6-month average: ${avg} a month` : undefined }),
      joins_last_month_ledger: metric('joins_last_month_ledger', 'October joins (membership ledger)', oct?.new_members, raw, {
        unit: 'members', scope: 'First payment in October',
        note: closerDeals != null && oct && closerDeals !== oct.new_members ? `The closer panel counts ${closerDeals} for the same month; the two count slightly different things (first payment vs. deals credited to closers).` : undefined,
      }),
    },
    tables: { by_month: p.months.map((m) => ({ month: m.month, new_members: m.new_members })) },
  };
}

export function normalizePipeline(raw, nowMs) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {}, private: {} };
  const from = '2026-10-29';
  const rows = p.rows.filter((r) => r.interview_date >= from);
  const days = (d) => Math.floor((nowMs - Date.parse(`${d}T23:59:59Z`)) / 86400000);
  const stale = rows.filter((r) => r.verdict === 'N' && days(r.interview_date) >= 3);
  const hot = rows.filter((r) => r.verdict === 'H');
  const scope = `Interviews ${from} to ${new Date(nowMs).toISOString().slice(0, 10)} that did not close`;
  const label = p.verdict_codes;
  const mix = {};
  for (const r of rows) mix[r.verdict] = (mix[r.verdict] || 0) + 1;
  return {
    metrics: {
      not_closed_since_oct1: metric('not_closed_since_oct1', 'Interviewed since Oct 1, not closed', p.summary.matched_not_closed, raw, { unit: 'prospects', scope: `Interviews taken since ${p.summary.window_start}; ${p.summary.excluded_closed} closed, ${p.summary.excluded_interview_not_taken} not taken` }),
      hot_not_closed: metric('hot_not_closed', 'Flagged hot, not closed yet', hot.length, raw, { unit: 'prospects', scope }),
      outcome_missing_3d: metric('outcome_missing_3d', 'No outcome recorded 3+ days after interview', stale.length, raw, { unit: 'prospects', scope }),
    },
    tables: {
      verdicts: Object.entries(mix).map(([k, v]) => ({ verdict: label[k] || k, prospects: v })).sort((a, b) => b.prospects - a.prospects),
    },
    private: {
      pipeline_hot: hot.map((r) => ({ name: r.name, interviewed: r.interview_date })),
      pipeline_no_outcome: stale.map((r) => ({ name: r.name, interviewed: r.interview_date, days: days(r.interview_date) })),
    },
  };
}

export function normalizeFathom(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {}, tables: {} };
  const sum = (k) => p.by_day.reduce((a, d) => a + d[k], 0);
  const scope = `Calls recorded in Fathom ${p.window.from} to ${p.window.to} (to read time), sorted by meeting title`;
  return {
    metrics: {
      calls_intro_2d: metric('calls_intro_2d', 'Intro calls recorded (2 days)', sum('intro'), raw, { unit: 'calls', scope }),
      calls_interview_2d: metric('calls_interview_2d', 'Interview & sales follow-up calls (2 days)', sum('interview_or_sales_followup'), raw, { unit: 'calls', scope }),
      calls_rd_2d: metric('calls_rd_2d', 'RD check-in calls (2 days)', sum('rd_checkin_or_followup'), raw, { unit: 'calls', scope }),
      calls_onboarding_2d: metric('calls_onboarding_2d', 'Onboarding calls (2 days)', sum('onboarding'), raw, { unit: 'calls', scope }),
    },
    tables: {
      calls: [
        { type: 'Intro (setters)', calls: sum('intro') },
        { type: 'Interview / sales follow-up', calls: sum('interview_or_sales_followup') },
        { type: 'RD check-in', calls: sum('rd_checkin_or_followup') },
        { type: 'Onboarding', calls: sum('onboarding') },
        { type: 'Internal meetings', calls: sum('internal') },
        { type: 'Other', calls: sum('other') },
      ],
    },
  };
}

export function normalizeSlack(raw) {
  const p = raw?.payload;
  if (!p) return { metrics: {} };
  const w = p.welcome_intros;
  return {
    metrics: {
      rd_sos_30d: metric('rd_sos_30d', 'RD SOS posts (30 days)', p.rd_sos.posts, raw, { unit: 'posts', scope: `#team-rd-sos since ${p.rd_sos.since}`, context: `${p.rd_sos.posts - p.rd_sos.posts_without_reply} answered, latest ${p.rd_sos.latest_post}` }),
      rd_sos_unanswered: metric('rd_sos_unanswered', 'RD SOS posts with no reply', p.rd_sos.posts_without_reply, raw, { unit: 'posts', scope: `#team-rd-sos since ${p.rd_sos.since}` }),
      welcome_intros_7d: {
        ...metric('welcome_intros_7d', 'New-member intros in #0-welcome-introductions (7 days)', w.top_level_posts_read, raw, { unit: 'posts', scope: `since ${w.since.slice(0, 10)}`, note: 'Read stopped after the first page — at least this many.' }),
        complete: w.complete !== false,
      },
      member_support_moved: metric('member_support_moved', 'Member support channel', null, raw, { missingReason: `Moved off Slack on ${p.member_support.moved_off_slack_on} (now DM / email) — not readable here` }),
    },
  };
}

/** Mastermind groups and how mastermind events land, for the clubhouse. */
export function normalizeMasterminds(groupsRaw, feedbackRaw) {
  const p = groupsRaw?.payload;
  const LABEL = { in_person: 'In person', digital_thu3: 'Virtual · 3rd Thursday', digital_tue2: 'Virtual · 2nd Tuesday', evening: 'Evening' };
  const out = { metrics: {}, tables: {} };
  if (p) {
    const groups = p.programs.reduce((a, x) => a + x.groups, 0);
    out.metrics.mm_groups = metric('mm_groups', 'Active mastermind groups', groups, groupsRaw, { unit: 'groups', scope: 'Groups with at least one active member seated', context: `${p.programs.reduce((a, x) => a + x.seats, 0).toLocaleString('en-US')} seats filled` });
    out.tables.programs = p.programs.map((x) => ({ program: LABEL[x.program] || x.program, groups: x.groups, seats: x.seats }));
  }
  const f = feedbackRaw?.payload;
  if (f) {
    const mm = f.aggregates.filter((a) => a.kind === 'Mastermind');
    const n = mm.reduce((a, x) => a + x.responses, 0);
    const nps = n ? Math.round(((mm.reduce((a, x) => a + x.promoters, 0) - mm.reduce((a, x) => a + x.detractors, 0)) / n) * 100) : null;
    out.metrics.mm_nps = metric('mm_nps', 'Mastermind NPS', nps, feedbackRaw, { unit: 'pts', scope: `Mastermind surveys since ${feedbackRaw.args.since}; ${n} responses` });
  }
  return out;
}
